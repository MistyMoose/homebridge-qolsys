import { Service, PlatformAccessory} from 'homebridge';
import { QolsysAlarmMode} from './QolsysPartition';
import { HBQolsysPanel } from './platform';

export class HKSecurityPanel {
  private service: Service;

  constructor(
    private readonly platform: HBQolsysPanel,
    private readonly accessory: PlatformAccessory,
    private readonly PartitionId: number,
  ) {

    this.platform.log.info('Partition' + this.PartitionId + '(Security System): ' + accessory.displayName);

    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Qolsys')
      .setCharacteristic(this.platform.Characteristic.Model, 'Qolsys IQ Panel')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, 'QolsysPanel' + this.PartitionId)
      .setCharacteristic(this.platform.Characteristic.Name, accessory.displayName);

    this.service = this.accessory.getService(this.platform.Service.SecuritySystem)
    || this.accessory.addService(this.platform.Service.SecuritySystem);

    const ValidCurrentStates = [
      this.platform.api.hap.Characteristic.SecuritySystemCurrentState.STAY_ARM,
      this.platform.api.hap.Characteristic.SecuritySystemCurrentState.AWAY_ARM,
      this.platform.api.hap.Characteristic.SecuritySystemCurrentState.DISARMED,
      this.platform.api.hap.Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED,
    ];

    const ValidTargetStates = [
      this.platform.api.hap.Characteristic.SecuritySystemTargetState.STAY_ARM,
      this.platform.api.hap.Characteristic.SecuritySystemTargetState.AWAY_ARM,
      this.platform.api.hap.Characteristic.SecuritySystemTargetState.DISARM,
    ];

    this.service.getCharacteristic(this.platform.api.hap.Characteristic.SecuritySystemCurrentState)
      .setProps({ validValues: ValidCurrentStates});

    this.service.getCharacteristic(this.platform.api.hap.Characteristic.SecuritySystemTargetState)
      .setProps({ validValues: ValidTargetStates });

    this.service.getCharacteristic(this.platform.Characteristic.SecuritySystemTargetState)
      .onSet(this.handleSecuritySystemTargetStateSet.bind(this));

    this.platform.Controller.on('PartitionAlarmModeChange', (Partition)=>{
      if(Partition.PartitionId === this.PartitionId){

        if(Partition.PartitionStatus === QolsysAlarmMode.ALARM_AUXILIARY ||
          Partition.PartitionStatus === QolsysAlarmMode.ALARM_FIRE ||
          Partition.PartitionStatus === QolsysAlarmMode.ALARM_POLICE){
          this.service.getCharacteristic(this.platform.Characteristic.SecuritySystemCurrentState)
            .updateValue(this.platform.Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED);
          return;
        }

        const HKCurrentStatus = this.QolsysPartitionStatusToCurrentHKStatus(Partition.PartitionStatus);
        const HKTargetStatus = this.QolsysPartitionStatusToTargetHKStatus(Partition.PartitionStatus);
        this.service.getCharacteristic(this.platform.Characteristic.SecuritySystemCurrentState).updateValue(HKCurrentStatus);
        this.service.getCharacteristic(this.platform.Characteristic.SecuritySystemTargetState).updateValue(HKTargetStatus);
      }
    });
  }

  handleSecuritySystemTargetStateSet(value) {

    switch(value){
      case this.platform.Characteristic.SecuritySystemTargetState.DISARM:{
        this.platform.Controller.SendArmCommand(QolsysAlarmMode.DISARM, this.PartitionId, 0, true);
        break;
      }

      case this.platform.Characteristic.SecuritySystemTargetState.AWAY_ARM:{
        const AwayExitDelay = this.platform.AwayExitDelay;
        const Bypass = this.platform.ForceArm;
        this.platform.Controller.SendArmCommand(QolsysAlarmMode.ARM_AWAY, this.PartitionId, AwayExitDelay, Bypass);
        break;
      }

      case this.platform.Characteristic.SecuritySystemTargetState.NIGHT_ARM:{
        const Bypass = this.platform.ForceArm;
        this.platform.Controller.SendArmCommand(QolsysAlarmMode.ARM_STAY, this.PartitionId, 0, Bypass);
        break;
      }

      case this.platform.Characteristic.SecuritySystemTargetState.STAY_ARM:{
        const HomeExitDelay = this.platform.HomeExitDelay;
        const Bypass = this.platform.ForceArm;
        this.platform.Controller.SendArmCommand(QolsysAlarmMode.ARM_STAY, this.PartitionId, HomeExitDelay, Bypass);
        break;
      }
    }
  }

  private QolsysPartitionStatusToCurrentHKStatus(Status: QolsysAlarmMode){

    const PreviousStatus = this.platform.Controller.GetPartitions()[this.PartitionId].PartitionPreviousStatus;

    switch(Status){
      case QolsysAlarmMode.EXIT_DELAY:
        return this.platform.Characteristic.SecuritySystemCurrentState.DISARMED;

      case QolsysAlarmMode.ENTRY_DELAY:

        if(PreviousStatus === QolsysAlarmMode.ARM_STAY){
          return this.platform.Characteristic.SecuritySystemCurrentState.STAY_ARM;
        } else{
          return this.platform.Characteristic.SecuritySystemCurrentState.AWAY_ARM;
        }

      case QolsysAlarmMode.ARM_STAY_EXIT_DELAY:
        return this.platform.Characteristic.SecuritySystemCurrentState.DISARMED;

      case QolsysAlarmMode.ARM_AWAY_EXIT_DELAY:
        return this.platform.Characteristic.SecuritySystemCurrentState.DISARMED;

      case QolsysAlarmMode.ARM_AWAY:
        return this.platform.Characteristic.SecuritySystemCurrentState.AWAY_ARM;

      case QolsysAlarmMode.ARM_STAY:
        return this.platform.Characteristic.SecuritySystemCurrentState.STAY_ARM;

      case QolsysAlarmMode.ALARM_AUXILIARY:
        return this.platform.Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED;

      case QolsysAlarmMode.ALARM_FIRE:
        return this.platform.Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED;

      case QolsysAlarmMode.ALARM_POLICE:
        return this.platform.Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED;

      case QolsysAlarmMode.DISARM:
        return this.platform.Characteristic.SecuritySystemCurrentState.DISARMED;

      case QolsysAlarmMode.Unknow:
        return this.platform.Characteristic.SecuritySystemCurrentState.DISARMED;
    }
  }

  private QolsysPartitionStatusToTargetHKStatus(Status: QolsysAlarmMode){

    switch(Status){
      case QolsysAlarmMode.EXIT_DELAY:
        return this.platform.Characteristic.SecuritySystemTargetState.AWAY_ARM;

      case QolsysAlarmMode.ENTRY_DELAY:
        return this.platform.Characteristic.SecuritySystemTargetState.DISARM;

      case QolsysAlarmMode.ARM_STAY_EXIT_DELAY:
        return this.platform.Characteristic.SecuritySystemTargetState.STAY_ARM;

      case QolsysAlarmMode.ARM_AWAY_EXIT_DELAY:
        return this.platform.Characteristic.SecuritySystemTargetState.AWAY_ARM;

      case QolsysAlarmMode.ARM_AWAY:
        return this.platform.Characteristic.SecuritySystemTargetState.AWAY_ARM;

      case QolsysAlarmMode.ARM_STAY:
        return this.platform.Characteristic.SecuritySystemTargetState.STAY_ARM;

      case QolsysAlarmMode.ALARM_AUXILIARY:
        return this.platform.Characteristic.SecuritySystemTargetState.DISARM;

      case QolsysAlarmMode.ALARM_FIRE:
        return this.platform.Characteristic.SecuritySystemTargetState.DISARM;

      case QolsysAlarmMode.ALARM_POLICE:
        return this.platform.Characteristic.SecuritySystemTargetState.DISARM;

      case QolsysAlarmMode.DISARM:
        return this.platform.Characteristic.SecuritySystemTargetState.DISARM;

      case QolsysAlarmMode.Unknow:
        return this.platform.Characteristic.SecuritySystemTargetState.DISARM;
    }
  }
}
