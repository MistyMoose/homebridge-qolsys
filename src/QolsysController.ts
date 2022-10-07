import { QolsysZone } from './QolsysZone';
import { QolsysPartition, QolsysAlarmMode } from './QolsysPartition';
import { TypedEmitter } from 'tiny-typed-emitter';
import tls = require('tls');
import net = require('net');

interface PayloadJSON{
  event:string;
  info_type: string;
  zone_event_type:string;
  partition_list:PartitionJSON[];
  zone:ZoneJSON;
  arming_type: string;
  alarm_type: string;
  partition_id:number;
  description:string;
  error_type: string;
}

interface PartitionJSON{
  partition_id:string;
  name:string;
  secure_arm:boolean;
  status:string;
  zone_list:ZoneJSON[];
}

interface ZoneJSON{
  id:number;
  name:string;
  group:string;
  zone_id:number;
  zone_physical_type:string;
  zone_alarm_type:string;
  zone_type:string;
  partition_id:string;
  type:string;
  status:string;
  state:string;
}

export enum QolsysControllerError{
  UndefinedError = 'Undefined Error',
  ConnectionError = 'Panel Connection Error',
  InvalidPayloadEvent = 'Received Invalid Payload Event',
  InvalidPayloadInfoType = 'Received Invalid Payload Info Type',
  InvalidZoneEventType = 'Receive Invalid Zone Event Type',
  InvalidArmingType = 'Received Invalid Arming Type',
  InvalidAlarmType = 'Receive Invalid Alarm Type',
  QolsysPanelError = 'Qolsys Panel Error'
}

export interface QolsysControllerEvent {
  'PanelReadyForOperation': (PanelReady: boolean) => void;
  'PanelReceivingNotifiation': (PanelReceivingNotification:boolean) => void;
  'ControllerError': (Error: QolsysControllerError, ErrorString: string) => void;
  'ZoneStatusChange': (Zone: QolsysZone) => void;
  'PartitionAlarmModeChange':(Partition: QolsysPartition) => void;
}

export class QolsysController extends TypedEmitter<QolsysControllerEvent> {
    Util = require('util');

    private Host: string;
    private Port: number;
    SecureToken = '';
    UserPinCode = '';
    private SecureSocket:tls.TLSSocket;
    private Socket: net.Socket;
    private SocktetTimeout = 180000;
    private SocketKeepAliveTimeout = 15000;
    private PartialMessage = '';

    private Partitions:Record<number, QolsysPartition> = {};
    private Zones:Record<number, QolsysZone> = {};

    private PanelReadyForOperation = false;
    private PanelReceivingNotifcation = false;
    private FirstRun = false;
    private LastRefreshDate = new Date();

    constructor(Host: string, Port:number) {
      super();
      this.Host = Host;
      this.Port = Port;
      this.Socket = new net.Socket();
      this.SecureSocket = new tls.TLSSocket(this.Socket, {rejectUnauthorized: false});
    }

    GetPartitions(){
      return this.Partitions;
    }

    GetZones(){
      return this.Zones;
    }

    Connect(){
      this.Zones = {};
      this.Partitions = {};

      this.PanelReadyForOperation = false;
      this.PanelReceivingNotifcation = false;
      this.FirstRun = false;
      this.PartialMessage = '';

      this.Socket = new net.Socket();
      this.Socket.setTimeout(this.SocktetTimeout);
      this.SecureSocket = new tls.TLSSocket(this.Socket, {rejectUnauthorized: false});

      this.Socket.on('timeout', ()=>{
        this.PanelReadyForOperation = false;
        this.PanelReceivingNotifcation = false;
        this.emit('PanelReceivingNotifiation', this.PanelReceivingNotifcation);
        this.Socket.destroy();
        this.emit('ControllerError', QolsysControllerError.ConnectionError, 'Timeout');
      });

      this.Socket.on('error', (error: Error) => {
        this.PanelReadyForOperation = false;
        this.PanelReceivingNotifcation = false;
        this.emit('PanelReceivingNotifiation', this.PanelReceivingNotifcation);
        this.Socket.destroy();
        this.emit('ControllerError', QolsysControllerError.ConnectionError, error.message);
      });

      this.SecureSocket.on('data', (data: Buffer) => {
        this.Parse(data.toString());
      });


      // Initial connection to Panel
      this.Socket.connect(this.Port, this.Host, () => {
        this.Refresh();
      });
    }

    private SendCommand(Command:string){
      console.log(Command);
      this.SecureSocket.write(Command);
    }

    StartOperation(){
      this.PanelReceivingNotifcation = true;
      this.FirstRun = true;
      this.Refresh();
      this.CheckIsRefreshNeed();
    }

    CheckIsRefreshNeed(){
      const Now = new Date();
      const Delta = (Now.getTime() - this.LastRefreshDate.getTime());
      if(Delta >= this.SocketKeepAliveTimeout){
        this.Refresh();
      }

      setTimeout(() => {
        this.CheckIsRefreshNeed();
      }, this.SocketKeepAliveTimeout/2);
      return;

    }

    private Refresh(){
      const CommandJSON = {
        nonce: '',
        action: 'INFO',
        info_type: 'SUMMARY',
        version: 1,
        source: 'C4',
        token: this.SecureToken,
      };

      this.SendCommand(JSON.stringify(CommandJSON));
    }

    private Parse(Message:string){

      //console.log('Receive:' + Message);

      if(Message.length >= 3 && Message.substring(0.3) === 'ACK'){
        this.PartialMessage = '';

      } else{
        Message += this.PartialMessage;

        try{
          const Payload:PayloadJSON = JSON.parse(Message);

          switch(Payload.event){

            case 'INFO':

              switch(Payload.info_type){
                case 'SUMMARY':
                  //if(!this.PanelReadyForOperation){
                  this.ProcessSummary(Payload);
                  //}
                  break;

                default:
                  this.emit('ControllerError', QolsysControllerError.InvalidPayloadInfoType, 'Received Invalid Payload Info Type:'
                  + Message);
              }
              break;

            case 'ZONE_EVENT':

              switch(Payload.zone_event_type){
                case 'ZONE_UPDATE':
                  this.ProcessZoneUpdate(Payload);
                  break;

                case 'ZONE_ACTIVE':
                  this.ProcessZoneActive(Payload);
                  break;

                default:
                  this.emit('ControllerError', QolsysControllerError.InvalidZoneEventType, 'Received Invalid Zone Event Type:' + Message);
                  break;
              }
              break;

            case 'ARMING':
              switch (Payload.arming_type) {
                case 'EXIT_DELAY':
                  this.ProcessArmingType(Payload.partition_id, QolsysAlarmMode.EXIT_DELAY);
                  break;

                case 'ENTRY_DELAY':
                  this.ProcessArmingType(Payload.partition_id, QolsysAlarmMode.ENTRY_DELAY);
                  break;

                case 'DISARM':
                  this.ProcessArmingType(Payload.partition_id, QolsysAlarmMode.DISARM);
                  break;

                case 'ARM_STAY':
                  this.ProcessArmingType(Payload.partition_id, QolsysAlarmMode.ARM_STAY);
                  break;

                case 'ARM_AWAY':
                  this.ProcessArmingType(Payload.partition_id, QolsysAlarmMode.ARM_AWAY);
                  break;

                default:
                  this.emit('ControllerError', QolsysControllerError.InvalidArmingType, 'Received Invalid Arming Type:' + Message);
                  break;
              }
              break;

            case 'ALARM':
              switch(Payload.alarm_type){

                case 'POLICE':
                  this.ProcessAlarm(Payload.partition_id, QolsysAlarmMode.ALARM_POLICE);
                  break;

                case 'FIRE':
                  this.ProcessAlarm(Payload.partition_id, QolsysAlarmMode.ALARM_FIRE);
                  break;

                case 'AUXILIARY':
                  this.ProcessAlarm(Payload.partition_id, QolsysAlarmMode.ALARM_AUXILIARY);
                  break;

                default:
                  this.emit('ControllerError', QolsysControllerError.InvalidArmingType, 'Received Invalid Alarm Type:' + Message);
                  break;
              }

              break;

            case 'ERROR':
              this.emit('ControllerError', QolsysControllerError.QolsysPanelError, 'Error received('
               + Payload.error_type +'):' + Payload.description);

              break;

            default:
              this.emit('ControllerError', QolsysControllerError.InvalidPayloadEvent, 'Received Invalid Payload Event');
              break;

          }

          this.PartialMessage = '';
          this.LastRefreshDate = new Date();

        }catch(error){
          this.PartialMessage = Message;
        }
      }
    }

    SendArmCommand(ArmingType:QolsysAlarmMode, PartitionId:number, Delay:number, Bypass:boolean){

      const ArmingJSON = {
        version: 1,
        source: 'C4',
        action: 'ARMING',
        nonce: '',
        token: this.SecureToken,
        user_code: this.UserPinCode,
        partition_id: PartitionId,
        arming_type: '',
        delay: Delay,
        bypass: Bypass,
      };


      switch(ArmingType){
        case QolsysAlarmMode.DISARM:
          ArmingJSON.arming_type = QolsysAlarmMode[ArmingType];
          break;

        case QolsysAlarmMode.ARM_AWAY:
          ArmingJSON.arming_type = QolsysAlarmMode[ArmingType];
          break;

        case QolsysAlarmMode.ARM_STAY:
          ArmingJSON.arming_type = QolsysAlarmMode[ArmingType];
          break;

        default:
          this.emit('ControllerError', QolsysControllerError.InvalidArmingType,
            'Sending Invalid Arming Type:' + QolsysAlarmMode[ArmingType]);
      }

      this.SendCommand(JSON.stringify(ArmingJSON));
    }

    private ProcessZoneUpdate(Payload:PayloadJSON){
      const Zone = this.Zones[Payload.zone.zone_id];
      if(Zone !== undefined){
        if(Zone.SetZoneStatusFromString(Payload.zone.status)){
          if(this.PanelReadyForOperation && this.PanelReceivingNotifcation){
            this.emit('ZoneStatusChange', Zone);
          }
        }
      }
    }

    private ProcessZoneActive(Payload:PayloadJSON){
      const Zone = this.Zones[Payload.zone.zone_id];
      if(Zone !== undefined){
        if(Zone.SetZoneStatusFromString(Payload.zone.status)){
          if(this.PanelReadyForOperation && this.PanelReceivingNotifcation){
            this.emit('ZoneStatusChange', Zone);
          }
        }
      }
      return;
    }

    private ProcessAlarm(PartitionId:number, AlarmMode:QolsysAlarmMode){
      const Partition = this.Partitions[PartitionId];
      if(Partition!== undefined){
        if(Partition.SetAlarmMode(AlarmMode)){
          if(this.PanelReadyForOperation && this.PanelReceivingNotifcation){
            this.emit('PartitionAlarmModeChange', Partition);
          }
        }
      }
    }

    private ProcessArmingType(PartitionId:number, AlarmMode:QolsysAlarmMode){
      const Partition = this.Partitions[PartitionId];
      if(Partition!== undefined){
        if(Partition.SetAlarmMode(AlarmMode)){
          if(this.PanelReadyForOperation && this.PanelReceivingNotifcation){
            this.emit('PartitionAlarmModeChange', Partition);
          }
        }
      }
    }

    private ProcessSummary(Payload:PayloadJSON){

      for( const PartitionId in Payload.partition_list){
        const part = Payload.partition_list[PartitionId];
        const Id = Number(part.partition_id);
        const Name = part.name;
        const SecureArm = part.secure_arm;
        const Status = part.status;

        let Partition = this.Partitions[Id];

        if(Partition === undefined){
          Partition = new QolsysPartition(Id);
          this.Partitions[Id] = Partition;
        }

        Partition.PartitionName = Name;
        Partition.SecureArm = SecureArm;

        if(Partition.SetAlarmModeFromString(Status)&& this.PanelReadyForOperation || this.FirstRun ){
          this.emit('PartitionAlarmModeChange', Partition);
        }

        for( const PayloadZone of part.zone_list){
          let Zone = this.Zones[PayloadZone.zone_id];
          if(Zone === undefined){
            Zone = new QolsysZone(PayloadZone.zone_id);
            this.Zones[PayloadZone.zone_id] = Zone;
          }

          Zone.SetZoneType(PayloadZone.type);
          Zone.ZoneName = PayloadZone.name;
          Zone.PartitionId = Number(PayloadZone.partition_id);

          if(Zone.SetZoneStatusFromString(PayloadZone.status) && this.PanelReadyForOperation || this.FirstRun ){
            this.emit('ZoneStatusChange', Zone);
          }
        }
      }

      if(!this.PanelReadyForOperation){
        this.PanelReadyForOperation = true;
        this.emit('PanelReadyForOperation', this.PanelReadyForOperation);
      }

      this.FirstRun = false;
    }
}