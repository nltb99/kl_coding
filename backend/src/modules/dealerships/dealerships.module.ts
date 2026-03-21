import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Dealership } from "./dealership.entity";
import { DealershipsController } from "./dealerships.controller";
import { DealershipsService } from "./dealerships.service";

@Module({
  imports: [TypeOrmModule.forFeature([Dealership])],
  controllers: [DealershipsController],
  providers: [DealershipsService],
  exports: [DealershipsService],
})
export class DealershipsModule {}
