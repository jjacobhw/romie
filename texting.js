/*
 * Romie Texting Module
 * Provides functions to manage user accounts, conversations, and messages in PostgreSQL.
 * All error messages are logged to the console. */

/**
 * Creates a user account with an username and password, adds them to PostgreSQL, 
 * and returns the user object.
 * @param {string} username - The username for the new account.
 * @param {string} password - The password for the new account.
 * @returns {Object} The created (or already existing) user object. */

const crypto = require('crypto');

function createAccount(username, password) {
    // Return error is username already exists in PostgreSQL
    let userRef = pgClient.query('SELECT * FROM users WHERE name = $1', [username]);
    userRef.then((result) => {
        if (result.rows.length > 0) {
            // TODO: Change text to look good in React
            console.error(`Username ${username} already exists.`);
            return result.rows[0];
        }
    });
    // Create a user object with the given username and password
    let user = {
        name: username,
        password: password,
        avatarUrl: 'https://kommodo.ai/i/zxasnXB2wNYSXfxpIr9N', // Default avatar URL for new users
    };
    // Add the user to PostgreSQL
    pgClient.query('INSERT INTO users (name, password, avatarUrl) VALUES ($1, $2, $3)', [username, password, 'https://kommodo.ai/i/zxasnXB2wNYSXfxpIr9N']);

    return user;
}

/**
 * Update the user's username in PostgreSQL.
 * @param {string} oldUsername - The current username of the user.
 * @param {string} newUsername - The new username for the user.
 * @return {boolean} True if the user is in the database, false otherwise. */

function updateProfileUsername(oldUsername, newUsername) {
    // Update the user's username in PostgreSQL
    let userRef = pgClient.query('SELECT * FROM users WHERE name = $1', [oldUsername]);
    userRef.then((result) => {
        if (result.rows.length === 0) {
            console.error(`User ${oldUsername} not found.`);
            return false;
        }
        pgClient.query('UPDATE users SET name = $1 WHERE name = $2', [newUsername, oldUsername]);
    });
    return true;
}

/**
 * Update the user's profile picture (avatar URL) in PostgreSQL.
 * @param {string} username - The username of the user to update.
 * @param {string} avatarUrl - The new avatar URL for the user.
 * @return {boolean} True if the user is in the database, false otherwise. */

function updateProfilePic(username, avatarUrl) {
    // Update the user's profile in PostgreSQL
    let userRef = pgClient.query('SELECT * FROM users WHERE name = $1', [username]);
    userRef.then((result) => {
        if (result.rows.length === 0) {
            console.error(`User ${username} not found.`);
            return false;
        }
        pgClient.query('UPDATE users SET avatarUrl = $1 WHERE name = $2', [avatarUrl, username]);
    });
    return true;
}

/**
 * Delete the user's account from PostgreSQL (if no account is found, prints error and does nothing)
 * @param {string} username - The username of the user to delete.
 * @return {boolean} True if the user was deleted, false otherwise. */

function deleteAccount(username) {
    let userRef = pgClient.query('SELECT * FROM users WHERE name = $1', [username]);
    userRef.then((result) => {
        if (result.rows.length === 0) {
            console.error(`User ${username} not found.`);
            return false;
        }
        pgClient.query('DELETE FROM users WHERE name = $1', [username]);
        let checkUserRef = pgClient.query('SELECT * FROM users WHERE name = $1', [username]);
        checkUserRef.then((result) => {
            if (result.rows.length !== 0) {
                console.error(`Failed to delete user ${username}.`);
                return false;
            }
        });
    });
    return true;
}

/**
 * Initialize a chat room in PostgreSQL and return an invite code to it.
 * @param {string} username - The username of the user creating the conversation.
 * @returns {integer} The invite code for the created conversation, 
 * or -1 if the user is already in a conversation or does not exist. */

async function createConversation(username) {
    // Check if the user exists
    const userResult = await pgClient.query('SELECT 1 FROM users WHERE name = \$1', [username]);
    if (userResult.rows.length === 0) {
        console.error(`User ${username} not found.`);
        return -1;
    }
    // Check if the user is already in an active conversation
    const userConversationsResult = await pgClient.query(
        'SELECT invitecode FROM conversations WHERE \$1 = ANY(users)', [username]);
    if (userConversationsResult.rows.length !== 0) {
        console.error(`User ${username} is already in a conversation with invite code ${userConversationsResult.rows[0].invitecode}.`);
        return -1;
    }
    
    // Generate secure, unique invite code safely
    let inviteCode;
    let isUnique = false;
    let attempts = 0;
    while (!isUnique && attempts < 5) {
        // Cryptographic 6-character hex string
        inviteCode = crypto.randomBytes(3).toString('hex');
        const existing = await pgClient.query('SELECT 1 FROM conversations WHERE invitecode = \$1', [inviteCode]);
        if (existing.rows.length === 0) {
            isUnique = true;
        } else {
            attempts++;
            console.warn(`Invite code collision detected for ${inviteCode}. Retrying...`);
        }
    }
    if (!isUnique) {
        console.error("Failed to generate unique invite code after maximum attempts.");
        return -1;
    }
    
    // Initialize conversation object
    const conversation = {
        inviteCode: inviteCode,
        messages: [],
        users: [username],
    };

    // Save conversation to PostgreSQL database
    await pgClient.query(
        'INSERT INTO conversations (invitecode, messages, users) VALUES (\$1, \$2, \$3)', 
        [conversation.inviteCode, JSON.stringify(conversation.messages), conversation.users]
    );

    return inviteCode;
}

/**
 * Add user to the conversation in PostgreSQL associated with the given invite code.
 * @param {string} username - The username of the user joining the conversation.
 * @param {integer} inviteCode - The invite code of the conversation to join.
 * @returns {boolean} True if the user successfully joined the conversation, 
 * or false if user doesn't exist, is already in a conversation, or invite code is invalid.
 */
async function joinConversation(username, inviteCode) {
    // Check if the user exists
    let userRef = pgClient.query('SELECT * FROM users WHERE name = $1', [username]);
    let userResult = await userRef;
    if (userResult.rows.length === 0) {
        console.error(`User ${username} not found.`);
        return false;
    }
    // Check if the user is already in a conversation
    let userConversationsRef = pgClient.query('SELECT * FROM conversations WHERE $1 = ANY(users)', [username]);
    let userConversationsResult = await userConversationsRef;
    if (userConversationsResult.rows.length !== 0) {
        console.error(`User ${username} is already in a conversation with invite code ${userConversationsResult.rows[0].invitecode}.`);
        return false;
    }
    // Find conversation with the given invite code
    let conversationRef = pgClient.query('SELECT * FROM conversations WHERE inviteCode = $1', [inviteCode]);
    let conversationResult = await conversationRef;
    if (conversationResult.rows.length === 0) {
        console.error(`Conversation with invite code ${inviteCode} does not exist.`);
        return false;
    }
    // Add user to the conversation
    await pgClient.query('UPDATE conversations SET users = array_append(users, $1) WHERE inviteCode = $2', [username, inviteCode]);
    return true;
}

/**
 * Refresh messages in conversation to the user's screen.
 * @param {integer} inviteCode - The invite code of the conversation to retrieve.
 * @return {boolean} True if the conversation was successfully retrieved, false otherwise.
 */
async function getConversation(inviteCode) {
    // Find conversation with the given invite code
    let conversationRef = pgClient.query('SELECT * FROM conversations WHERE inviteCode = $1', [inviteCode]);
    // Print to user's screen only the messages that aren't already displayed.
    let displayedMessages = new Set();  
    let conversationResult = await conversationRef;
    if (conversationResult.rows.length !== 0) {
        let conversation = conversationResult.rows[0];
        // TODO: Change text to look good in React
        conversation.messages.forEach((message) => {
            if (!displayedMessages.has(message)) {
                console.log(message);
                displayedMessages.add(message);
            }
        });
    }
    // Check if conversation with the given invite code exists
    if (conversationResult.rows.length === 0) {
        // TODO: Change text to look good in React
        console.error(`Conversation with invite code ${inviteCode} does not exist.`);
        return false;
    }
    return true;
}

/**
 * Remove a user from the conversation in PostgreSQL associated with the given invite code.
 * @param {string} username - The username of the user leaving the conversation.
 * @param {integer} inviteCode - The invite code of the conversation to leave.
 * @return {boolean} True if the user successfully left the conversation, false otherwise.
 */
async function leaveConversation(username, inviteCode) {
    // Find conversation with the given invite code
    let conversationRef = pgClient.query('SELECT * FROM conversations WHERE inviteCode = $1', [inviteCode]);
    let conversationResult = await conversationRef;
    if (conversationResult.rows.length === 0) {
        console.error(`Conversation with invite code ${inviteCode} does not exist.`);
        return false;
    }
    let conversation = conversationResult.rows[0];
    // Remove user from the conversation
    await pgClient.query('UPDATE conversations SET users = array_remove(users, $1) WHERE inviteCode = $2', [username, inviteCode]);
    // Delete the conversation if no users are left
    if (conversation.users.length === 0) {
        await deleteConversation(inviteCode);
    }
    // Check if user is still in the conversation
    conversationRef = pgClient.query('SELECT * FROM conversations WHERE inviteCode = $1', [inviteCode]);
    conversationResult = await conversationRef;
    if (conversationResult.rows.length !== 0) {
        conversation = conversationResult.rows[0];
        if (conversation.users.includes(username)) {
            return false;
        }
    }
    return true;
}

/**
 * Delete a conversation from PostgreSQL associated with the given invite code.
 * @param {integer} inviteCode - The invite code of the conversation to delete.
 * @return {boolean} True if the conversation was successfully deleted, false otherwise.
 */
async function deleteConversation(inviteCode) {
    // Delete the conversation with the given invite code
    await pgClient.query('DELETE FROM conversations WHERE inviteCode = $1', [inviteCode]);
    // Verify deletion
    let conversationRef = pgClient.query('SELECT * FROM conversations WHERE inviteCode = $1', [inviteCode]);
    let conversationResult = await conversationRef;
    if (conversationResult.rows.length !== 0) {
        console.error('Failed to delete conversation with invite code:', inviteCode);
        return false;
    }
    return true;
}

/**
 * Add a message to the front of the queue in the specified conversation.
 * @param {string} username - The username of the user sending the message.
 * @param {integer} inviteCode - The invite code of the conversation to send the message to.
 * @param {string} messageText - The text content of the message to send.
 * @param {string} attachments - Any attachments associated with the message.
 */
async function sendMessage(username, inviteCode,messageText, attachments) {
    // Add the message to the conversation in PostgreSQL
    await pgClient.query(
        'UPDATE conversations SET messages = array_prepend($1, messages) WHERE inviteCode = $2',
        [{
            username: username,
            messageText: messageText,
            attachments: attachments,
            timestamp: new Date()
        }, inviteCode]
    );
    // Verify that the message was added
    let conversationRef = pgClient.query('SELECT * FROM conversations WHERE inviteCode = $1', [inviteCode]);
    let conversationResult = await conversationRef;
    if (conversationResult.rows.length === 0) {
        console.error('Conversation with invite code not found:', inviteCode);
        return false;
    }
    let conversation = conversationResult.rows[0];
    let messageExists = conversation.messages.some((msg) => msg.messageText === messageText && msg.username === username);
    if (!messageExists) {
        console.error('Failed to send message to conversation with invite code:', inviteCode);
        return false;
    }
    return true;
}

// 
function readMessages() {}

function shareInviteCode() {}

function syncMessages() {}

function uploadMedia(file) {}

// TODO: function signInUser(username, password) {}
// TODO: function signOutUser() {}