import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ServiceBay } from "../service-bays/service-bay.entity";
import { Technician } from "../technicians/technician.entity";
import { ServiceType } from "../service-types/service-type.entity";
import { Appointment } from "../appointments/appointment.entity";
import { AvailabilityController } from "./availability.controller";
import { AvailabilityService } from "./availability.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ServiceBay,
      Technician,
      ServiceType,
      Appointment,
    ]),
  ],
  controllers: [AvailabilityController],
  providers: [AvailabilityService],
  exports: [AvailabilityService],
})
export class AvailabilityModule {}
