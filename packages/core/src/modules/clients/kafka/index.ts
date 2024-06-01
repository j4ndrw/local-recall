import * as constants from "./constants";
import * as config from "./config";
import * as defaults from "./defaults";
import { Kafka } from "kafkajs";

let client: Kafka | null = null;
const register = (c: Kafka | undefined | null) => {
  client = c ?? defaults.createKafkaClient();
  return client;
};
const getClient = () => {
  if (!client) throw new Error("Kafka client not initialized");
  return client;
};

const module = {
  constants,
  config,
  defaults,
  register,
  getClient,
};

export default module;
