import { Controller, Get, Query, BadRequestException } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiQuery } from "@nestjs/swagger";
import { TechniciansService } from "./technicians.service";

@ApiTags("technicians")
@Controller("technicians")
export class TechniciansController {
  constructor(private readonly techniciansService: TechniciansService) {}

  @Get()
  @ApiOperation({ summary: "List active technicians for a dealership" })
  @ApiQuery({ name: "dealershipId", required: true })
  findByDealership(@Query("dealershipId") dealershipId: string) {
    if (!dealershipId) {
      throw new BadRequestException("dealershipId is required");
    }
    return this.techniciansService.findByDealership(dealershipId);
  }
}
