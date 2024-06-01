import { chromaClientModule } from "../clients";

export const create = async () =>
  chromaClientModule.getClient().getOrCreateCollection({
    name: chromaClientModule.config.COLLECTION_NAME,
  });

export const remove = async () =>
  chromaClientModule
    .getClient()
    .deleteCollection({ name: chromaClientModule.config.COLLECTION_NAME });
