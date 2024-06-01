import { Kafka } from "kafkajs";
import { DEFAULT_KAFKA_BROKER, DEFAULT_KAFKA_CLIENT_ID } from "./constants";

export const createKafkaClient = () =>
  new Kafka({
    clientId: DEFAULT_KAFKA_CLIENT_ID,
    brokers: [DEFAULT_KAFKA_BROKER],
  });
