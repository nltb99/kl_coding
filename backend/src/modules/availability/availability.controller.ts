import { Controller, Get, Query, BadRequestException } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiQuery } from "@nestjs/swagger";
import { AvailabilityService } from "./availability.service";

@ApiTags("availability")
@Controller("availability")
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  @Get()
  @ApiOperation({ summary: "Check availability for a service slot" })
  @ApiQuery({ name: "dealershipId", required: true })
  @ApiQuery({ name: "serviceTypeId", required: true })
  @ApiQuery({
    name: "startTime",
    required: true,
    description: "ISO 8601 UTC datetime (e.g. 2026-06-01T07:00:00.000Z)",
  })
  async checkAvailability(
    @Query("dealershipId") dealershipId: string,
    @Query("serviceTypeId") serviceTypeId: string,
    @Query("startTime") startTimeParam: string,
  ) {
    if (!dealershipId || !serviceTypeId || !startTimeParam) {
      throw new BadRequestException(
        "dealershipId, serviceTypeId, and startTime are required",
      );
    }

    const startTime = new Date(startTimeParam);
    if (isNaN(startTime.getTime())) {
      throw new BadRequestException(
        "Invalid startTime format. Use ISO 8601 (e.g. 2026-06-01T07:00:00.000Z)",
      );
    }

    return this.availabilityService.checkAvailability(
      dealershipId,
      serviceTypeId,
      startTime,
    );
  }
}
