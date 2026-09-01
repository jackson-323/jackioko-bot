module.exports = require('../../lib/commandFactory').make({ name: 'lock', category: 'group', description: 'Only admins can edit group settings.', group: true, admin: true, botAdmin: true });
