const eventStart = (event) => new Date(event.startsAt).getTime();
const eventEnd = (event) => Math.max(eventStart(event), new Date(event.endsAt).getTime());

export const layoutEvents = (events = []) => {
  const sorted = events.map((event, index) => ({ event, index }))
    .sort((left, right) => eventStart(left.event) - eventStart(right.event)
      || (eventEnd(right.event) - eventStart(right.event)) - (eventEnd(left.event) - eventStart(left.event))
      || left.index - right.index);
  const laidOut = [];
  let cluster = [];
  let clusterEnd = -Infinity;
  const flush = () => {
    if (!cluster.length) return;
    const columns = [];
    cluster.forEach(({ event, index }) => {
      let column = columns.findIndex((lastEnd) => lastEnd <= eventStart(event));
      if (column === -1) {
        column = columns.length;
        columns.push(-Infinity);
      }
      columns[column] = eventEnd(event);
      laidOut.push({ event, index, column });
    });
    const count = columns.length;
    laidOut.filter((item) => cluster.some((entry) => entry.index === item.index)).forEach((item) => {
      item.left = item.column / count;
      item.width = 1 / count;
    });
    cluster = [];
    clusterEnd = -Infinity;
  };
  sorted.forEach((entry) => {
    if (cluster.length && eventStart(entry.event) >= clusterEnd) flush();
    cluster.push(entry);
    clusterEnd = Math.max(clusterEnd, eventEnd(entry.event));
  });
  flush();
  return laidOut.sort((left, right) => left.index - right.index).map(({ event, left, width, column }) => ({
    ...event,
    column,
    left,
    width,
  }));
};
