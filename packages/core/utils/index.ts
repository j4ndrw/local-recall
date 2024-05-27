export const log = (message: string) => (_target: any, propertyKey: string, _descriptor: PropertyDescriptor) => {
  console.log(`${propertyKey}: ${message}`)
}
