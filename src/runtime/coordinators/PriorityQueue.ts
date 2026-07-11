export class PriorityQueue<T> {
  private items: { item: T; priority: number }[] = [];

  public enqueue(item: T, priority: number): void {
    // Lower number means higher priority (e.g. CRITICAL = 0)
    const element = { item, priority };
    let added = false;
    for (let i = 0; i < this.items.length; i++) {
      if (element.priority < this.items[i].priority) {
        this.items.splice(i, 0, element);
        added = true;
        break;
      }
    }
    if (!added) {
      this.items.push(element);
    }
  }

  public dequeue(): T | undefined {
    const el = this.items.shift();
    return el?.item;
  }

  public isEmpty(): boolean {
    return this.items.length === 0;
  }

  public peek(): T | undefined {
    return this.items[0]?.item;
  }
}
