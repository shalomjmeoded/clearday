/** expo-notifications stub: tracks scheduled/cancelled notifications for assertions. */
let nextId = 1;

const scheduled = new Map();
const cancelled = [];

exports.scheduled = scheduled;
exports.cancelled = cancelled;

exports.__resetNotifications = function __resetNotifications() {
  scheduled.clear();
  cancelled.length = 0;
  nextId = 1;
};

exports.setNotificationHandler = function setNotificationHandler() {};
exports.setNotificationChannelAsync = async function setNotificationChannelAsync() {};
exports.AndroidImportance = { HIGH: 4 };
exports.SchedulableTriggerInputTypes = { DATE: 'date' };

exports.getPermissionsAsync = async function getPermissionsAsync() {
  return { status: 'granted' };
};

exports.requestPermissionsAsync = async function requestPermissionsAsync() {
  return { status: 'granted' };
};

exports.scheduleNotificationAsync = async function scheduleNotificationAsync(input) {
  const id = `notif-${nextId++}`;
  scheduled.set(id, { body: input.content.body, date: input.trigger.date });
  return id;
};

exports.cancelScheduledNotificationAsync = async function cancelScheduledNotificationAsync(id) {
  scheduled.delete(id);
  cancelled.push(id);
};
