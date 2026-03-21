import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Dealership } from "../dealerships/dealership.entity";
import { ServiceType } from "../service-types/service-type.entity";
import { ServiceBay } from "../service-bays/service-bay.entity";
import { Technician } from "../technicians/technician.entity";
import { Customer } from "../customers/customer.entity";
import { Vehicle } from "../vehicles/vehicle.entity";
import { SeedService } from "./seed.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Dealership,
      ServiceType,
      ServiceBay,
      Technician,
      Customer,
      Vehicle,
    ]),
  ],
  providers: [SeedService],
})
export class SeedModule {}
