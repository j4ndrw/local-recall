import { kafkaClientModule } from "../clients";

export const create = () => {
  const consumer = kafkaClientModule.getClient().consumer({
    groupId: kafkaClientModule.config.KAFKA_SCREENSHOT_GROUP_ID,
  });
  const init = async () => {
    consumer.subscribe({
      topic: kafkaClientModule.config.KAFKA_SCREENSHOT_TOPIC,
    });
    return consumer;
  };

  return { init };
};
