import {
  IsUUID,
  IsString,
  IsOptional,
  IsDateString,
  MaxLength,
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

function IsFutureDate(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: "isFutureDate",
      target: (object as any).constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: string) {
          if (typeof value !== "string") return false;
          const date = new Date(value);
          return !isNaN(date.getTime()) && date > new Date();
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be a future date`;
        },
      },
    });
  };
}

export class CreateAppointmentDto {
  @ApiProperty()
  @IsUUID()
  customerId: string;

  @ApiProperty()
  @IsUUID()
  vehicleId: string;

  @ApiProperty()
  @IsUUID()
  technicianId: string;

  @ApiProperty()
  @IsUUID()
  serviceBayId: string;

  @ApiProperty()
  @IsUUID()
  serviceTypeId: string;

  @ApiProperty({ description: "ISO 8601 datetime — must be in the future" })
  @IsDateString()
  @IsFutureDate({ message: "startTime must be a future date" })
  startTime: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  notes?: string;
}
