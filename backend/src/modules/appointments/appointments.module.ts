import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Appointment } from "./appointment.entity";
import { Technician } from "../technicians/technician.entity";
import { ServiceBay } from "../service-bays/service-bay.entity";
import { ServiceType } from "../service-types/service-type.entity";
import { AppointmentsController } from "./appointments.controller";
import { AppointmentsService } from "./appointments.service";
import { AvailabilityModule } from "../availability/availability.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Appointment,
      Technician,
      ServiceBay,
      ServiceType,
    ]),
    AvailabilityModule,
  ],
  controllers: [AppointmentsController],
  providers: [AppointmentsService],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
