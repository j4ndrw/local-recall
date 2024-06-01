import { Consumer, Message, Producer } from "kafkajs";
import { Screenshot } from "../../types";
import screenshot from "screenshot-desktop";
import { kafkaClientModule } from "../clients";
import { fromUnixTime, getUnixTime } from "date-fns";
import { Collection } from "chromadb";
import { recallModule } from "../recall";
import { logger } from "../../utils";
import sharp from "sharp";

export const resize = async (image: Buffer) =>
  sharp(image).resize({ width: 1344, height: 336 }).toBuffer();

export const take = async (options?: {
  resize?: boolean;
}): Promise<Screenshot[]> => {
  const displays = await screenshot.listDisplays();

  return Promise.all(
    displays.map(async (display) => {
      const s = await screenshot({ format: "jpeg", screen: display.id });
      const buffer = options?.resize ? await resize(s) : s.toString("base64");
      const data = buffer.toString("base64");
      return { data, display };
    }),
  );
};

export const stream = async (producer: Producer) => {
  const screenshots = await take({ resize: true });
  const timestamp = getUnixTime(new Date()).toString();

  await producer.send({
    topic: kafkaClientModule.config.KAFKA_SCREENSHOT_TOPIC,
    messages: screenshots.map((s) => {
      const data = { screenshot: s, timestamp };

      return {
        value: JSON.stringify(data),
        timestamp,
      } as Message;
    }),
  });
};

export const describeOnDemand = async (
  consumer: Consumer,
  collection: Collection,
) => {
  await consumer.run({
    partitionsConsumedConcurrently: 1,
    eachMessage: async ({ topic, message, partition, pause }) => {
      const resume = pause();

      if (topic !== kafkaClientModule.config.KAFKA_SCREENSHOT_TOPIC) {
        return resume();
      }

      const data = message.value
        ? (JSON.parse(message.value.toString()) as {
            screenshot: Screenshot;
            timestamp: string;
          })
        : null;
      const screenshot = data?.screenshot;
      const timestamp = data?.timestamp;
      if (!screenshot || !timestamp) {
        consumer.seek({ topic, partition, offset: message.offset + 1 });
        return resume();
      }

      logger.debug(
        `Describing screenshot taken at ${fromUnixTime(+timestamp)} for display: ${screenshot.display.name}`,
      );

      const now = new Date();
      const description = await recallModule.behaviour.generateDescription(
        screenshot.data,
      );
      const embedding =
        await recallModule.behaviour.generateEmbedding(description);

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

      consumer.seek({ topic, partition, offset: message.offset + 1 });
      resume();
    },
  });
};
