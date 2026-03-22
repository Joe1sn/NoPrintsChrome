'use strict';

const notify = async message => {
    const id = await chrome.notifications.create({
        type: 'basic',
        title: chrome.runtime.getManifest().name,
        message,
        iconUrl: '/icons/48.png'
    });
    setTimeout(chrome.notifications.clear, 3000, id);
};

chrome.runtime.onMessage.addListener((request, sender) => {
    if (request.method === 'possible-fingerprint') {
        chrome.action.setIcon({
            tabId: sender.tab.id,
            path: {
                '16': '/icons/detected/16.png',
                '32': '/icons/detected/32.png',
                '48': '/icons/detected/48.png'
            }
        });
        chrome.action.setTitle({
            tabId: sender.tab.id,
            title: 'Possible attempt to fingerprint'
        });
        chrome.storage.local.get({
            'notification': false,
            'notification.list': []
        }, prefs => {
            chrome.tabs.sendMessage(sender.tab.id, {
                tabId: sender.tab.id,
                method: 'report',
                message: `Possible attempt to fingerprint from "${sender.tab.title}" is blocked.`,
                prefs
            });
        });
    }
    else if (request.method === 'badge') {
        chrome.action.setBadgeText({
            tabId: sender.tab.id,
            text: request.text
        });
    }
    else if (request.method === 'notify') {
        notify(request.message);
    }
    else if (request.method === 'disabled') {
        chrome.action.setBadgeText({
            tabId: sender.tab.id,
            text: '×'
        });
        chrome.action.setTitle({
            tabId: sender.tab.id,
            title: 'Disabled on this page'
        });
    }
    else if (request.method === 'enabled') {
        chrome.action.setBadgeText({
            tabId: sender.tab.id,
            text: ''
        });
        chrome.action.setTitle({
            tabId: sender.tab.id,
            title: 'Enabled on this page (no fingerprinting is detected)'
        });
    }
});

const observe = async () => {
    if (observe.busy) {
        console.info('observer is busy');
        return;
    }
    observe.busy = true;

    const prefs = await chrome.storage.local.get({
        enabled: true,
        list: [],
        mode: 'session',
        red: 4,
        green: 4,
        blue: 4
    });
    try {
        await chrome.scripting.unregisterContentScripts();

        if (prefs.enabled) {
            const excludeMatches = [];

            await chrome.declarativeNetRequest.updateSessionRules({
                addRules: [{
                    'id': 1,
                    'priority': 1,
                    'action': {
                        'type': 'modifyHeaders',
                        'responseHeaders': [{
                            'header': 'Server-Timing',
                            'operation': 'set',
                            'value': `cfp-json-dur=0;desc="${encodeURIComponent(JSON.stringify({
                                'enabled': prefs.enabled,
                                'mode': prefs.mode,
                                'red': prefs.red,
                                'green': prefs.green,
                                'blue': prefs.blue
                            }))}"`
                        }]
                    },
                    'condition': {
                        'requestDomains': prefs.whitelist,
                        'resourceTypes': ['main_frame', 'sub_frame']
                    }
                }],
                removeRuleIds: [1]
            });

            chrome.action.setTitle({
                title: 'Fingerprint protection is globally enabled.'
            });
            chrome.action.setIcon({
                path: {
                    '16': '/icons/enabled/16.png',
                    '32': '/icons/enabled/32.png',
                    '48': '/icons/enabled/48.png'
                }
            });
        }
        else {
            await chrome.declarativeNetRequest.updateSessionRules({
                addRules: [],
                removeRuleIds: [1]
            });
            await chrome.scripting.registerContentScripts([{
                allFrames: true,
                matchOriginAsFallback: true,
                id: 'disabled',
                js: ['/inject/disabled.js'],
                matches: ['<all_urls>'],
                runAt: 'document_start'
            }]);
            chrome.action.setTitle({
                title: 'Fingerprint protection is disabled.'
            });
            chrome.action.setIcon({
                path: {
                    '16': '/icons/16.png',
                    '32': '/icons/32.png',
                    '48': '/icons/48.png'
                }
            });
        }
    }
    catch (e) {
        console.error(e);
        notify('Unexpected Error: ' + e.message);
    }
    observe.busy = false;
};

chrome.runtime.onInstalled.addListener(observe);
chrome.runtime.onStartup.addListener(observe);
chrome.storage.onChanged.addListener(ps => {
    if (ps.enabled || ps.list) {
        observe();
    }
});