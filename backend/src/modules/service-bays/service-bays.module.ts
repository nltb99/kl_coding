import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ServiceBay } from "./service-bay.entity";
import { ServiceBaysService } from "./service-bays.service";
import { ServiceBaysController } from "./service-bays.controller";

@Module({
  imports: [TypeOrmModule.forFeature([ServiceBay])],
  controllers: [ServiceBaysController],
  providers: [ServiceBaysService],
  exports: [ServiceBaysService],
})
export class ServiceBaysModule {}
