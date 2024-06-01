import { ChromaClient } from "chromadb";
import { Kafka } from "kafkajs";
import { Ollama } from "ollama";
import {
  chromaClientModule,
  kafkaClientModule,
  ollamaClientModule,
} from "./modules/clients";
import { recallModule } from "./modules/recall";
import { screenshotModule } from "./modules/screenshot";

export const createLocalRecall = (options?: {
  ollamaClient?: Ollama;
  chromaClient?: ChromaClient;
  kafkaClient?: Kafka;
}) => {
  ollamaClientModule.register(options?.ollamaClient);
  chromaClientModule.register(options?.chromaClient);
  kafkaClientModule.register(options?.kafkaClient);

  if (process.env["LOCAL_RECALL_DEBUG"]) {
    console.log("DEBUG MODE - ON");
    (async () => {
      await kafkaClientModule
        .getClient()
        .admin()
        .deleteTopics({
          topics: [kafkaClientModule.config.KAFKA_SCREENSHOT_TOPIC],
        })
        .catch(() => {});
      await screenshotModule.collection.remove();
    })();
  }

  return {
    record: recallModule.behaviour.record,
    query: recallModule.behaviour.query,
  };
};
