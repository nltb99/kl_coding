import {
  IsUUID,
  IsString,
  IsOptional,
  IsDateString,
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

export class RescheduleAppointmentDto {
  @ApiProperty({ description: "New start time (ISO 8601, must be future)" })
  @IsDateString()
  @IsFutureDate({ message: "newStartTime must be a future date" })
  newStartTime: string;

  @ApiProperty({ required: false, description: "Override technician (keeps existing if omitted)" })
  @IsUUID()
  @IsOptional()
  technicianId?: string;

  @ApiProperty({ required: false, description: "Override service bay (keeps existing if omitted)" })
  @IsUUID()
  @IsOptional()
  serviceBayId?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  notes?: string;
}
