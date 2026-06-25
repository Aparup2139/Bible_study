import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import type { AskResponse } from '@bibleway/shared-types';
import { SupabaseAuthGuard } from '../auth/auth.guard';
import { AgentService } from './agent.service';
import { AskDto } from './dto/agent.dto';

@Controller('agent')
export class AgentController {
  constructor(private readonly agent: AgentService) {}

  /** Ask a question; the answer is grounded in the Bible and quotes scripture. */
  @Post('ask')
  @UseGuards(SupabaseAuthGuard)
  ask(@Body() dto: AskDto): Promise<AskResponse> {
    return this.agent.ask(dto.question);
  }
}
