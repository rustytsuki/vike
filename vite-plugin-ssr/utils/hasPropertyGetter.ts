export function hasPropertyGetter(obj: Object, prop: string): boolean {
  const descriptor = Object.getOwnPropertyDescriptor(obj, prop)
  return !!descriptor && !('value' in descriptor) && !!descriptor.get
}
