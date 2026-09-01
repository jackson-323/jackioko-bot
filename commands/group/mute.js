module.exports = require('../../lib/commandFactory').make({ name: 'mute', category: 'group', description: 'Only admins can send messages.', group: true, admin: true, botAdmin: true });
