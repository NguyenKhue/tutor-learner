/** The point's display title: the part after the topic, without the leading order number (`Topic/01 Title` → `Title`). */
export function pointTitle(id: string): string {
  const i = id.indexOf('/')
  return (i < 0 ? id : id.slice(i + 1)).replace(/^\d+\s+/, '')
}
