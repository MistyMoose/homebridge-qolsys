export enum QolsysAlarmMode{
  DISARM = 'DISARM',
  ENTRY_DELAY = 'ENTRY_DELAY',
  EXIT_DELAY ='EXIT_DELAY',
  ARM_AWAY = 'ARM_AWAY',
  ARM_STAY = 'ARM_STAY',
  ALARM_POLICE = 'ALARM_POLICE',
  ALARM_FIRE = 'ALARM_FIRE',
  ALARM_AUXILIARY = 'ALARM_AUXILIARY',
  Unknow = 'UNKNOW',
}

export class QolsysPartition{
    PartitionId: number;
    PartitionName = '';
    PartitionStatus = QolsysAlarmMode.Unknow;
    EntryDelay = 0;
    ExitDelay = 0;
    ErrorText = '';
    SecureArm = false;

    constructor(PartitionId: number){
      this.PartitionId = PartitionId;
    }

    GetAlarmDetected():boolean{
      if(this.PartitionStatus === QolsysAlarmMode.ALARM_AUXILIARY ||
         this.PartitionStatus === QolsysAlarmMode.ALARM_FIRE ||
         this.PartitionStatus === QolsysAlarmMode.ALARM_POLICE){
        return true;
      }
      return false;
    }

    SetAlarmMode(AlarmMode: QolsysAlarmMode):boolean{
      if(AlarmMode !== this.PartitionStatus){
        this.PartitionStatus = AlarmMode;
        return true;
      }
      return false;
    }

    SetAlarmModeFromString(AlarmModeString:string):boolean{
      switch(AlarmModeString){
        case 'DISARM':
          return this.SetAlarmMode(QolsysAlarmMode.DISARM);

        case 'EXIT_DELAY':
          return this.SetAlarmMode(QolsysAlarmMode.EXIT_DELAY);

        case 'ENTRY_DELAY':
          return this.SetAlarmMode(QolsysAlarmMode.ENTRY_DELAY);

        case 'ARM_STAY':
          return this.SetAlarmMode(QolsysAlarmMode.ARM_STAY);

        case 'ARM_AWAY':
          return this.SetAlarmMode(QolsysAlarmMode.ARM_AWAY);

        default:
          return this.SetAlarmMode(QolsysAlarmMode.Unknow);
      }
    }
}