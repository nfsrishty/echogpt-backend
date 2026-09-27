import { Module } from '@nestjs/common';
import { ProvidersModule } from '../providers/providers.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

@Module({
  imports: [ProvidersModule],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
