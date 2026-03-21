import { Controller, Get, Query, BadRequestException } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiQuery } from "@nestjs/swagger";
import { VehiclesService } from "./vehicles.service";

@ApiTags("vehicles")
@Controller("vehicles")
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  @Get()
  @ApiOperation({ summary: "List vehicles for a customer" })
  @ApiQuery({ name: "customerId", required: true })
  findByCustomer(@Query("customerId") customerId: string) {
    if (!customerId) {
      throw new BadRequestException("customerId is required");
    }
    return this.vehiclesService.findByCustomer(customerId);
  }
}
