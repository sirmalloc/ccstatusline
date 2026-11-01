// Moves one item to another index, keeping the rest in order. Next to its
// neighbour that is a swap; wrapping past either end takes the item to the
// other end rather than swapping it with the item there.
export function moveItem<T>(items: T[], fromIndex: number, toIndex: number): T[] {
    const moved = [...items];
    const [item] = moved.splice(fromIndex, 1);
    if (item !== undefined) {
        moved.splice(toIndex, 0, item);
    }

    return moved;
}
