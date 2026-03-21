import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { LoggerModule } from "nestjs-pino";
import { TerminusModule } from "@nestjs/terminus";
import { APP_FILTER, APP_INTERCEPTOR } from "@nestjs/core";

import { DealershipsModule } from "./modules/dealerships/dealerships.module";
import { ServiceTypesModule } from "./modules/service-types/service-types.module";
import { ServiceBaysModule } from "./modules/service-bays/service-bays.module";
import { TechniciansModule } from "./modules/technicians/technicians.module";
import { CustomersModule } from "./modules/customers/customers.module";
import { VehiclesModule } from "./modules/vehicles/vehicles.module";
import { AvailabilityModule } from "./modules/availability/availability.module";
import { AppointmentsModule } from "./modules/appointments/appointments.module";
import { SeedModule } from "./modules/seed/seed.module";
import { HealthModule } from "./modules/health/health.module";
import { GlobalHttpExceptionFilter } from "./common/filters/http-exception.filter";
import { LoggingInterceptor } from "./common/interceptors/logging.interceptor";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        pinoHttp: {
          level: config.get("NODE_ENV") === "production" ? "info" : "debug",
          transport:
            config.get("NODE_ENV") !== "production"
              ? { target: "pino-pretty", options: { colorize: true } }
              : undefined,
          redact: ["req.headers.authorization"],
          genReqId: () => require("uuid").v4(),
        },
      }),
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: "postgres",
        host: config.get("DATABASE_HOST", "localhost"),
        port: config.get<number>("DATABASE_PORT", 5432),
        username: config.get("DATABASE_USER", "keyloop"),
        password: config.get("DATABASE_PASSWORD", "keyloop_pass"),
        database: config.get("DATABASE_NAME", "keyloop_scheduler"),
        entities: [__dirname + "/**/*.entity{.ts,.js}"],
        migrations: [__dirname + "/database/migrations/*{.ts,.js}"],
        migrationsRun: true,
        synchronize: false,
        logging: config.get("NODE_ENV") !== "production",
      }),
    }),
    TerminusModule,
    DealershipsModule,
    ServiceTypesModule,
    ServiceBaysModule,
    TechniciansModule,
    CustomersModule,
    VehiclesModule,
    AvailabilityModule,
    AppointmentsModule,
    SeedModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: GlobalHttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class AppModule {}
