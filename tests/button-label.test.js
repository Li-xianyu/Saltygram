import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compactButtonLabel} from '../public/button-label.js';
test('mixed labels omit emoji but preserve meaningful text and numbers',()=>{
 for(const [input,output]of [['✅ 下载','下载'],['👨‍👩‍👧‍👦 家庭','家庭'],['🇨🇳 中文','中文'],['👍🏽 Like','Like'],['1️⃣ 下一页 2/3','下一页 2/3'],['返回 12','返回 12']])assert.equal(compactButtonLabel(input),output);
});
test('emoji-only controls remain usable and keep their original labels',()=>{
 for(const label of ['👍🏽','⬅️','1️⃣','🇨🇳','👨‍👩‍👧‍👦','⭐️ + ⚡️'])assert.equal(compactButtonLabel(label),label);
});
