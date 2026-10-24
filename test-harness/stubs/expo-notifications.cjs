/** expo-notifications stub: tracks scheduled/cancelled notifications for assertions. */
let nextId = 1;

const scheduled = new Map();
const cancelled = [];

exports.scheduled = scheduled;
exports.cancelled = cancelled;

exports.__resetNotifications = function __resetNotifications() {
  scheduled.clear();
  cancelled.length = 0;
  // Categories are registered once per app process, so they survive resets
  // just as they do on a device.
  nextId = 1;
};

const categories = new Map();
exports.categories = categories;

exports.setNotificationHandler = function setNotificationHandler() {};
exports.setNotificationCategoryAsync = async function setNotificationCategoryAsync(
  identifier,
  actions
) {
  categories.set(identifier, actions);
};
exports.addNotificationResponseReceivedListener =
  function addNotificationResponseReceivedListener() {
    return { remove() {} };
  };
exports.getLastNotificationResponseAsync =
  async function getLastNotificationResponseAsync() {
    return null;
  };
exports.DEFAULT_ACTION_IDENTIFIER = 'expo.modules.notifications.actions.DEFAULT';
exports.setNotificationChannelAsync = async function setNotificationChannelAsync() {};
exports.AndroidImportance = { HIGH: 4 };
exports.SchedulableTriggerInputTypes = { DATE: 'date' };

// Test hook: the next getPermissionsAsync call waits on this promise, which
// models the real native round-trip and lets a test park a reminder sync at
// that point while other database work proceeds.
let permissionGate = null;
exports.__setPermissionGate = function __setPermissionGate(promise) {
  permissionGate = promise;
};

exports.getPermissionsAsync = async function getPermissionsAsync() {
  if (permissionGate) {
    const gate = permissionGate;
    permissionGate = null;
    await gate;
  }
  return { status: 'granted' };
};

exports.requestPermissionsAsync = async function requestPermissionsAsync() {
  return { status: 'granted' };
};

exports.scheduleNotificationAsync = async function scheduleNotificationAsync(input) {
  const id = `notif-${nextId++}`;
  scheduled.set(id, {
    body: input.content.body,
    date: input.trigger.date,
    categoryIdentifier: input.content.categoryIdentifier,
  });
  return id;
};

exports.cancelScheduledNotificationAsync = async function cancelScheduledNotificationAsync(id) {
  scheduled.delete(id);
  cancelled.push(id);
};
