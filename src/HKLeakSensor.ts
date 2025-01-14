import { Service, PlatformAccessory } from 'homebridge';
import { HKSensor } from './HKSensor';
import { QolsysZoneStatus} from './QolsysZone';
import { HKSensorType, HBQolsysPanel } from './platform';

export class HKLeakSensor extends HKSensor {

  constructor(
    protected readonly platform: HBQolsysPanel,
    protected readonly accessory: PlatformAccessory,
    readonly ZoneId: number,
  ) {

    super(platform, accessory, ZoneId, HKSensorType.MotionSensor);

    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Qolsys Panel')
      .setCharacteristic(this.platform.Characteristic.Model, 'HK Leak Sensor')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, 'QolsysZone' + ZoneId);

    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName);
  }

  GetService():Service{
    return this.accessory.getService(this.platform.Service.LeakSensor)
    || this.accessory.addService(this.platform.Service.LeakSensor);
  }

  HandleEventDetected(ZoneStatus: QolsysZoneStatus){
    const LeakDetected = ZoneStatus === QolsysZoneStatus.OPEN;

    setTimeout(() => {
      this.service.updateCharacteristic(this.platform.Characteristic.LeakDetected, LeakDetected);
      this.LastEvent = new Date();
    }, this.EventDelayNeeded());
  }
}
