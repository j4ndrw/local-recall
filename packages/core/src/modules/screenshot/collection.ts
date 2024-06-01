import { chromaClientModule } from "../clients";

export const create = async () =>
  chromaClientModule.getClient().getOrCreateCollection({
    name: chromaClientModule.config.COLLECTION_NAME,
  });
