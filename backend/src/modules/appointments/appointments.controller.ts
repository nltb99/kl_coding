import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Headers,
  ParseUUIDPipe,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiQuery, ApiHeader } from "@nestjs/swagger";
import { AppointmentsService } from "./appointments.service";
import { CreateAppointmentDto } from "./dto/create-appointment.dto";
import { RescheduleAppointmentDto } from "./dto/reschedule-appointment.dto";

@ApiTags("appointments")
@Controller("appointments")
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Post()
  @ApiOperation({
    summary: "Create an appointment with concurrency protection",
  })
  @ApiHeader({
    name: "Idempotency-Key",
    required: false,
    description: "Unique key to prevent duplicate submissions (UUID recommended)",
  })
  create(
    @Body() dto: CreateAppointmentDto,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    return this.appointmentsService.createAppointment(dto, idempotencyKey);
  }

  @Get()
  @ApiOperation({ summary: "List appointments" })
  @ApiQuery({ name: "customerId", required: false })
  @ApiQuery({ name: "status", required: false, enum: ["confirmed", "cancelled", "completed"] })
  findAll(
    @Query("customerId") customerId?: string,
    @Query("status") status?: string,
  ) {
    return this.appointmentsService.findAll(customerId, status);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get appointment detail" })
  findOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.appointmentsService.findOne(id);
  }

  @Patch(":id/cancel")
  @ApiOperation({ summary: "Cancel a confirmed appointment" })
  cancel(@Param("id", ParseUUIDPipe) id: string) {
    return this.appointmentsService.cancel(id);
  }

  @Patch(":id/complete")
  @ApiOperation({ summary: "Mark a confirmed appointment as completed" })
  complete(@Param("id", ParseUUIDPipe) id: string) {
    return this.appointmentsService.complete(id);
  }

  @Patch(":id/reschedule")
  @ApiOperation({ summary: "Reschedule a confirmed appointment to a new time" })
  reschedule(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: RescheduleAppointmentDto,
  ) {
    return this.appointmentsService.reschedule(id, dto);
  }
}
