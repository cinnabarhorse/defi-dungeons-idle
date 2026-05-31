import { defineNpcDialogue } from './types';

export const dialogue = defineNpcDialogue({
  npcId: 'portalmage',
  npcName: 'PortalMage',
  dialogues: {
    greeting: {
      text: 'Greetings, ${playerName}! I am **Nyx**, disciple of the **Portal Mages**, Keeper of the Dungeon, and purveyor of fine wares. What do you seek? ',
      responses: [
        {
          text: 'Tell me about the Portal Mages.',
          nextDialogue: 'portal-mages',
        },
        { text: 'Tell me about the Dungeon.', nextDialogue: 'dungeon' },
        {
          text: 'Daily Quest.',
          nextDialogue: 'daily_quest',
        },
        { text: 'Show me your wares.', nextDialogue: 'shop_menu' },
        { text: 'I must continue my journey.', nextDialogue: 'farewell' },
      ],
    },

    // Added node to satisfy greeting -> "portal-mages"
    'portal-mages': {
      text: 'We are the Protectors of the **Great Portal**, the first and last line of defense against the Lickquidators. Many of our kin have perished throughout the epochs, but our loyalty to Gotchikin is unwavering.',
      responses: [
        {
          text: 'What is the Great Portal?',
          nextDialogue: 'great_portal',
        },
        {
          text: 'What are the Lickquidators?',
          nextDialogue: 'what_are_lickquidators',
        },
        {
          text: 'What happened to your brethren?',
          nextDialogue: 'brethren',
        },
        { text: 'Another time. Farewell.', nextDialogue: 'farewell' },
      ],
    },

    great_portal: {
      text: 'The **Great Portal** is the gateway to the Gotchiverse. It is the only way to travel between the Ethereal and Nether realms.',
      responses: [
        {
          text: 'Where is the Great Portal?',
          nextDialogue: 'where_is_great_portal',
        },
        {
          text: 'Another time. Farewell.',
          nextDialogue: 'farewell',
        },
      ],
    },
    what_are_lickquidators: {
      text: 'Lickquidators are our mortal enemies. They feed on yield, and consume the souls of the unworthy. In the catacombs beneath us dwell a multitude of them, waiting to prey on the unwary.',
      responses: [
        {
          text: 'Another time. Farewell.',
          nextDialogue: 'farewell',
        },
      ],
    },
    brethren: {
      text: 'Many of my Portal Mage brethren were slain by the Lickquidators, in various battles over the epochs. It is not something I wish to speak further of right now.',
      responses: [
        {
          text: 'Another time. Farewell.',
          nextDialogue: 'farewell',
        },
      ],
    },
    where_is_great_portal: {
      text: 'The **Great Portal** is located in the Ethereal realm, at the center of the Gotchiverse, far away from this land. If you are worthy, maybe one day you will see it.',
      responses: [
        {
          text: 'Another time. Farewell.',
          nextDialogue: 'farewell',
        },
      ],
    },

    dungeon: {
      text: 'The dungeons beneath us are infested with rogue Lickquidators who infiltrated the Gotchiverse via a hidden portal. Chief among them is the **Portal Guardian**, a foul beast ensconced in the bowels of the dungeon.',
      responses: [
        {
          text: 'Tell me more about the Portal Guardian',
          nextDialogue: 'portal_guardian',
        },
        {
          text: 'What dangers should I expect?',
          nextDialogue: 'dungeon_enemies',
        },
        { text: 'I am ready to face it.', nextDialogue: 'farewell' },
        {
          text: 'Perhaps later. Show me your wares.',
          nextDialogue: 'shop_menu',
        },
      ],
    },
    portal_guardian: {
      text: 'The **Portal Guardian** is a hellish beast, the result of a blasphemous fusion of the Lickquidators and some native fauna of the Gotchiverse. Many of my kin have fallen to his odious lust.',
      responses: [
        {
          text: 'I will slay him',
          nextDialogue: 'slay_portal_guardian',
        },
        {
          text: 'Another time. Farewell.',
          nextDialogue: 'farewell',
        },
      ],
    },

    dungeon_enemies: {
      text: 'The dungeon is infested with many variants of unholy Lickquidators. Slimes, Tongued Fiends, and Rekt Doggos prowl the Dungeon, yearning to consume your soul, and your yield. But chief among them is the **Portal Guardian**, the foulest of them all.',
      responses: [
        {
          text: 'Tell me more about the Portal Guardian',
          nextDialogue: 'portal_guardian',
        },
        {
          text: 'Another time. Farewell.',
          nextDialogue: 'farewell',
        },
      ],
    },

    slay_portal_guardian: {
      text: 'Many have uttered those words, but few have returned back from the Dungeons after an encounter with the **Portal Guardian**. With every soul consumed, he gets stronger. I wish you luck. ',
      responses: [
        {
          text: 'I wish to purchase some wares from you',
          nextDialogue: 'shop_menu',
        },
        {
          text: 'Another time. Farewell.',
          nextDialogue: 'farewell',
        },
      ],
    },
    daily_quest: {
      text: 'The score to beat on **${difficulty}** is **${score}**. Begin your **Daily Quest** run now?',
      responses: [
        { text: "Yes, let's do it.", nextDialogue: 'daily_quest_confirm' },
        { text: "No, I'm not ready.", nextDialogue: 'shop_menu' },
      ],
    },
    daily_quest_confirm: {
      text: 'Daily Quest Run enabled! May the Portal light your path.',
      responses: [{ text: 'Farewell.', nextDialogue: 'farewell' }],
    },
    daily_quest_unavailable: {
      text: "You've already completed your Daily Run today. Try again tomorrow!",
      responses: [{ text: 'Farewell.', nextDialogue: 'farewell' }],
    },

    shop_menu: {
      text: 'My wares are limited, but they may come in handy. What do you seek?',
      responses: [
        {
          text: '**Health Potion** — 5 Gold',
          nextDialogue: 'action:shop:buy:health_potion',
        },
        {
          text: '**Mana Potion** — 5 Gold',
          nextDialogue: 'action:shop:buy:mana_potion',
        },
        { text: 'Nothing for now.', nextDialogue: 'farewell' },
      ],
    },
    purchase_ok: {
      text: 'The exchange is complete. May this aid keep your thread unbroken.',
      responses: [
        { text: 'Show me the wares again.', nextDialogue: 'shop_menu' },
        { text: 'That is all, thanks.', nextDialogue: 'farewell' },
      ],
    },
    purchase_insufficient: {
      text: 'Your pouch is light. Gather more Gold and the portals will oblige.',
      responses: [
        { text: 'Let me see the wares again.', nextDialogue: 'shop_menu' },
        { text: "I'll return later.", nextDialogue: 'farewell' },
      ],
    },
    purchase_out_of_range: {
      text: 'Step nearer so the weave can bind the trade properly.',
      responses: [
        { text: "I'll move closer.", nextDialogue: 'shop_menu' },
        { text: 'Another time.', nextDialogue: 'farewell' },
      ],
    },
    purchase_fail: {
      text: 'The portal flickered. Try again once the energies settle.',
      responses: [
        { text: 'Let me try again.', nextDialogue: 'shop_menu' },
        { text: "I'll be back later.", nextDialogue: 'farewell' },
      ],
    },
    farewell: {
      text: 'May the portals you open lead to wisdom and wonder, traveler. Remember - you are both the key and the door, both the seeker and the destination. The magic you seek is already within you, waiting to be awakened.',
      responses: [
        { text: 'Thank you for your wisdom, PortalMage.', nextDialogue: 'end' },
        { text: 'I may return to learn more.', nextDialogue: 'return' },
      ],
    },
    return: {
      text: "The pathways between us remain open always. When you have practiced what I've shared, return and we shall explore deeper mysteries together. Until then, may your journey be filled with magical discoveries.",
      responses: [{ text: 'Until we meet again.', nextDialogue: 'end' }],
    },
    end: {
      text: 'Safe travels, dimensional wanderer.',
      responses: [],
    },
  },
});

export default dialogue;
