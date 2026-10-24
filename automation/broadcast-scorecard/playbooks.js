/* Planned broadcasts from the team's webinar communication docs.
 * offset: days from webinar day (-1 = day before, 1 = next day).
 * goal: what the message asks people to do — 'click' (a link) or 'reply'.
 * text: the variable lines of the planned copy, used to match real sends. */
var PLAYBOOKS = {
  tue: {
    label: 'Tuesday webinar',
    rules: [
      'Always give a space before and after the link; otherwise the link will be invalid.',
      'Always check the date, time and link of the webinar against the webinar schedule.',
      'Check the template category (marketing or utility) before sending. Marketing templates need senior approval in utility first.',
      'Right after the webinar, change the redirection link (https://sb.flexifunnels.com/genie-demo).'
    ],
    slots: [
      { offset: -1, time: '10:00', template: 'uisxuibxjabuixdemo', audience: 'Registered', goal: 'click',
        text: 'registered session on Flexi Genie Launch Your Business Online in 10 Minutes is happening on at. People inside the community are already discovering what happens when AI does the heavy lifting. Join the community here. Now it is your turn to see how a simple chat with Flexi Genie can turn an idea into a real online business. Plus get FREE 2-day access to your own AI Business Launcher Tool starting at 5:30 PM. Don’t miss the LIVE build. Join the community here' },
      { offset: -1, time: '14:00', template: '10minreminder2pm_ftsrds', audience: 'Registered', goal: 'reply',
        text: 'Launch where You can build your online Business in 10 Minutes Directly From Your Phone Live Build. Tomorrow at 7:30 PM. As part of your registration, session-related reference material is available. We’re giving you exclusive Zero to One Crore training Worth $497 for FREE. This alone has already helped 1,000+ beginners and creators generate real online income fast. Reply below INCOME to grab your access' },
      { offset: -1, time: '18:00', template: '10minreminder2cccc_yfpvesss_nwz44', audience: 'Registered', goal: 'click',
        text: 'Launch Your Business Online in 10 Minutes is happening tomorrow. Tomorrow at 7:30 PM. What if your landing page could tell you exactly why people aren’t converting and then actually fix it? That’s what Funnel Builder Agent is. And you get your own AI tool tomorrow at 5:30 PM for Free to build a business live in 10 Minutes under my guidance. Join the community so you don’t miss any updates' },
      { offset: 0, time: '10:00', template: 'uisxuibxjabuixdemo', audience: 'Registered', goal: 'click',
        text: 'At 5:30 PM today, you’ll unlock FREE access to our AI Business Builder Tool and build your own business LIVE with us, step by step. registered session on Flexi Genie Launch Your Business Online in 10 Minutes LIVE Today at 7:30 PM IST. Join the community for major updates. Now it’s your turn to see how a simple chat with Flexi Genie can turn an idea into a real online business. Don’t miss the LIVE build. Here is the Joining Link. Join on time to avoid any rush' },
      { offset: 0, time: '14:30', template: 'uisxuibxjabuixdemo', audience: 'Registered', goal: 'click',
        text: '3 hours left before we send out logins! Make sure you’ve signed up with the same email you used for the workshop, so your access reaches you on time. Flexi Genie Webinar is happening TONIGHT! See how Mayank built a complete website in just 10 minutes and showed it to his client during the session. No designer. No developer. Just Flexi Genie. Want to build like this? Join us tonight and see what you can create in 10 minutes. Join our exclusive community for major updates' },
      { offset: 0, time: '17:30', template: '10mintoolaccesstemp', audience: 'All registered', goal: 'click',
        text: 'Your FREE AI Business-Building Tool is LIVE! Launch Your Business Online in 10 Minutes. Tonight at 7:30 PM Before we go LIVE in 2 hour, make sure you Claim your access. Claim your FREE access here. Sign up and log in. Keep the tool open and ready! Claim your access now and be ready to BUILD with us at 7:30 PM IST' },
      { offset: 0, time: '19:00', template: 'uisxuibxjabuixdemo_zr6in', audience: 'All registered + missed of previous webinar', goal: 'click',
        text: 'scheduled session is just 30 min away. Launch Your Business Online in 10 Minutes Directly From Your Phone Live Build. If you haven’t got access to your AI tool yet here is the link. Here is the joining link. Webinar ID. No replay. No recording. It doesn’t run again' },
      { offset: 0, time: '19:25', template: 'qsazazazdemolive', audience: 'All registered + missed of previous webinar', goal: 'click',
        text: 'Your registered session is now live. Launch Your Business Online in 10 Minutes Directly From Your Phone Live Build. COME IN NOW. Webinar ID. It happens once. No rewind. No replay. Don’t be the one seeing it in somebody else’s screenshot tomorrow. It’s about to start. And you’re still out here reading this' },
      { offset: 0, time: '19:30', template: 'uisxuibxjabuixdemo_zr6in, qsazazazdemolive', audience: 'All registered + missed', goal: 'click',
        text: 'Don’t miss this. your registered session IS HOUSEFULL & The Live Flexi Genie Demo just started. You can join if you are not there. Showing it live, launching the business live in just 10 Minutes. 760+ business people have already joined. If you haven’t got access to your AI tool yet here is the link. If you haven’t joined yet, join now as seats might get full' },
      { offset: 0, time: '19:35', template: 'newbusinessmosxd_v9chjs, uisxuibxjabuixdemo_zr6in_dws7x', audience: 'All registered + missed of previous webinar', goal: 'click',
        text: 'registered session that is LIVE RIGHT NOW. This is just insane; all the freelancers, business owners, and solopreneurs are going crazy inside. The live 10 Minute Business Launch is happening, and don’t miss this out! If you haven’t got access to your AI tool yet here is the link. Join Now. Hurry Up! Last and Final Call!' },
      { offset: 0, time: '19:40', template: 'qsazazazdemolive', audience: 'All registered + missed of previous webinar', goal: 'click',
        text: 'Your registered session is now live. One final chance to get in inside! Join Here Last Chance. Don’t miss it! ₹1.5 Lakhs+ worth of bonuses will be revealed now! Join in! Don’t wait!' },
      { offset: 0, time: '19:50', template: 'livepspchallengefi, newbusinessmosxd_v9chjs, uisxuibxjabuixdemo_zr6in_dws7x', audience: 'All registered + missed of previous webinar', goal: 'click',
        text: 'you haven’t missed out on the Flexi Genie demo yet. your registered session is almost full. This Live Flexi Genie Demo has just made everyone go crazy. Here is the link Only last 50 spots left. Join now to also get ₹1.5+ lakhs worth of attendee-only bonuses' },
      { offset: 0, time: '20:00', template: 'qsazazazdemolive, newbusinessmosxd_v9chjs (video), uisxuibxjabuixdemo_zr6in_dws7x', audience: 'All registered + missed of previous webinar', goal: 'click',
        text: 'Your registered session is now live. Revealing 5 Business Models to make easy money in 2026 even as a beginner using AI. Final Chance to join. You can watch others build their success or start building yours. The choice is yours. Join LIVE right now' },
      { offset: 1, time: '10:30', label: 'Next day · before 11 AM', template: 'Miss15', audience: 'Missed audience', goal: 'reply',
        text: 'I can see that you missed yesterday’s session where we showed how to completely automate, build, and launch a business with phone in just 10 minutes. Could you please share the reason here? Once I have it, I’ll share the next session invite so you can get started. Schedule mismatch. Zoom app wasn’t installed. Link Wasn’t Working' }
    ]
  },
  wed: {
    label: 'Wednesday webinar',
    rules: [
      'Always give a space before and after the link; otherwise the link will be invalid.',
      'Always check the date, time and link of the webinar against the webinar schedule.',
      'Check the template category (marketing or utility) before sending. Marketing templates need senior approval in utility first.',
      'Right after the webinar, change the redirection link (https://sb.flexifunnels.com/genie-demo).'
    ],
    slots: [
      { offset: 0, time: '10:00', template: 'uisxuibxjabuixdemo', audience: 'Registered', goal: 'click',
        text: 'registered session on Flexi Genie Launch Your Business Online in 10 Minutes is LIVE TODAY. People inside the community are already discovering what happens when AI does the heavy lifting. Join the community here. Now it’s your turn to see how a simple chat with Flexi Genie can turn an idea into a real online business. Today. Don’t miss the LIVE build. Live Joining Link Here. Join on time to avoid any rush' },
      { offset: 0, time: '10:00', label: 'Missed audience · 10 AM', template: 'pspmissed_auidence111, pspmissed_auidence', audience: 'Missed audience', goal: 'click',
        text: 'This is a reminder regarding your missed session yesterday Launch Your Business Online in 10 Minutes Directly From Your Phone. 1,000+ people are on the waitlist to attend this session after missing it last time. If you are one of them, you can’t afford to miss out. In this workshop, we take a real business idea from someone attending live and put it online in 10 minutes. On a visible clock. From a phone. From an empty account. and how you can duplicate the same system in just 3 simple steps to launch your online journey to Lakhs & Crores just like our 4,500+ mentees! To confirm your attendance, click on Please Confirm Here' },
      { offset: 0, time: '14:00', template: 'tfp6pmwebinarday_2uruwx', audience: 'Registered', goal: 'click',
        text: 'This is a reminder for your upcoming session Launch Your Business Online in 10 Minutes Directly From Your Phone Implement with me. You can join the session using this link. We’re taking one real business idea and launching it online in just 10 minutes website, product, checkout, payments, members area & follow-ups, all built from a phone, live on the clock! Get FREE AI BUSINESS LAUNCH TOOL ACCESS FOR 2 DAYS. Don’t miss out!' },
      { offset: 0, time: '17:30', label: 'Tool access · 5:30 PM', template: '10mintoolaccesstemp', audience: 'All registered', goal: 'click',
        text: 'Your FREE AI Business-Building Tool is LIVE! Launch Your Business Online in 10 Minutes. Tonight at 7:30 PM Before we go LIVE in 2 hour, make sure you Claim your access. Claim your FREE access here. Sign up and log in. Keep the tool open and ready! Claim your access now and be ready to BUILD with us at 7:30 PM IST' },
      { offset: 0, time: '19:00', template: 'uisxuibxjabuixdemo_zr6in', audience: 'All registered + missed', goal: 'click',
        text: 'scheduled session is just 30 min away. Launch Your Business Online in 10 Minutes Directly From Your Phone Live Build. Here is the joining link. Webinar ID. No replay. No recording. It doesn’t run again' },
      { offset: 0, time: '19:25', template: 'qsazazazdemolive', audience: 'All registered + missed', goal: 'click',
        text: 'Your registered session is now live. Launch Your Business Online in 10 Minutes Directly From Your Phone Live Build. COME IN NOW. Webinar ID. It happens once. No rewind. No replay. Don’t be the one seeing it in somebody else’s screenshot tomorrow. It’s about to start. And you’re still out here reading this' },
      { offset: 0, time: '19:30', template: 'uisxuibxjabuixdemo_zr6in, qsazazazdemolive', audience: 'All registered + missed', goal: 'click',
        text: 'Don’t miss this. your registered session IS HOUSEFULL & The Live Flexi Genie Demo just started. You can join if you are not there. Showing it live, launching the business live in just 10 Minutes. 760+ business people have already joined. If you haven’t joined yet, join now as seats might get full' },
      { offset: 0, time: '19:35', template: 'newbusinessmosxd_v9chjs, uisxuibxjabuixdemo_zr6in_dws7x', audience: 'All registered + missed', goal: 'click',
        text: 'registered session that is LIVE RIGHT NOW. This is just insane; all the freelancers, business owners, and solopreneurs are going crazy inside. The live 10 Minute Business Launch is happening and don’t miss this out! Join Now. Hurry Up! Last and Final Call!' },
      { offset: 0, time: '19:40', template: 'qsazazazdemolive', audience: 'All registered + missed', goal: 'click',
        text: 'Your registered session is now live. One final chance to get in inside! Join Here Last Chance. Don’t miss it! ₹1.5 Lakhs+ worth of bonuses will be revealed now! Join in! Don’t wait!' },
      { offset: 0, time: '19:50', template: 'livepspchallengefi, newbusinessmosxd_v9chjs, uisxuibxjabuixdemo_zr6in_dws7x', audience: 'All registered + missed', goal: 'click',
        text: 'you haven’t missed out the Flexi Genie demo yet. your registered session is almost full. This Live Flexi Genie Demo has just made everyone go crazy. Here is the link Only last 50 spots left. Join now to also get ₹1.5+ lakhs worth of attendees only bonuses' },
      { offset: 0, time: '20:00', template: 'qsazazazdemolive, newbusinessmosxd_v9chjs (video), uisxuibxjabuixdemo_zr6in_dws7x', audience: 'All registered + missed', goal: 'click',
        text: 'Your registered session is now live. Revealing 5 Business Models to make easy money in 2026 even as a beginner using AI. Final Chance to join. You can watch others build their success or start building yours. The choice is yours. Join LIVE right now' },
      { offset: 1, time: '10:30', label: 'Next day · before 11 AM', template: 'Miss15', audience: 'Missed audience', goal: 'reply',
        text: 'I can see that you missed yesterday’s session where we showed how to completely automate, build and launch a business with phone in just 10 minutes. Could you please share the reason here? Once I have it, I’ll share the next session invite so you can get started. Schedule mismatch. Zoom app wasn’t installed. Link Wasn’t Working' }
    ]
  }
};
