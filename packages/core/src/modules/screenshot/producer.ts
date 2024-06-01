import { kafkaClientModule } from "../clients";

export const create = () => {
  const producer = kafkaClientModule.getClient().producer();
  const init = async () => {
    producer.connect();
    return producer;
  };
  return { init };
};
