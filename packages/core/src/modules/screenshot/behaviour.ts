import { Consumer, Message, Producer } from "kafkajs";
import { Screenshot } from "../../types";
import screenshot from "screenshot-desktop";
import { kafkaClientModule } from "../clients";
import { fromUnixTime, getUnixTime } from "date-fns";
import { Collection } from "chromadb";
import { recallModule } from "../recall";

export const take = async (): Promise<Screenshot[]> => {
  const displays = await screenshot.listDisplays();

  return Promise.all(
    displays.map(async (display) => {
      const s = await screenshot({ format: "jpeg", screen: display.id });
      return { data: s.toString("base64"), display };
    }),
  );
};

export const stream = async (producer: Producer) => {
  const screenshots = await take();
  await producer.send({
    topic: kafkaClientModule.config.KAFKA_SCREENSHOT_TOPIC,
    messages: screenshots.map(
      (s) =>
        ({
          value: JSON.stringify(s),
          timestamp: getUnixTime(new Date()).toString(),
        }) as Message,
    ),
  });
};

export const describeOnDemand = async (
  consumer: Consumer,
  collection: Collection,
) => {
  await consumer.run({
    partitionsConsumedConcurrently: 1,
    eachMessage: async ({ topic, message }) => {
      if (topic !== kafkaClientModule.config.KAFKA_SCREENSHOT_TOPIC) return;

      const timestamp = message.timestamp;
      const screenshot = message.value
        ? (JSON.parse(message.value.toString()) as Screenshot)
        : null;
      if (!screenshot) return;

      consumer.pause([{ topic }]);

      console.log(
        `Describing screenshot taken at ${fromUnixTime(+timestamp)} for display: ${screenshot.display.name}`,
      );

      const now = new Date();
      const description = await recallModule.behaviour.generateDescription(
        screenshot.data,
        { debug: true }
      );
      const embedding = await recallModule.behaviour.generateEmbedding(description);

      const id = `${timestamp}-${screenshot.display.name}-${screenshot.display.id}`;
      const doc = JSON.stringify({
        screenshot,
        description: `DATE-AND-TIME: ${now}, DESCRIPTION: ${description}`,
      });
      await collection.add({
        ids: [id],
        embeddings: [embedding],
        documents: [doc],
      });

      consumer.resume([{ topic }]);
    },
  });
};
