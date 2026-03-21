import { Controller, Get } from "@nestjs/common";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { CustomersService } from "./customers.service";

@ApiTags("customers")
@Controller("customers")
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  @ApiOperation({ summary: "List all customers" })
  findAll() {
    return this.customersService.findAll();
  }
}
