const axios = require('axios');
const { chromium } = require('playwright');

const token = process.env.BOT_TOKEN;
const chatId = process.env.CHAT_ID;
const accounts = process.env.ACCOUNTS;

if (!accounts) {
  console.log('❌ 未配置账号');
  process.exit(1);
}

// 解析多个账号，支持逗号或分号分隔
const accountList = accounts.split(/[,;]/).map(account => {
  const [user, pass] = account.split(":").map(s => s.trim());
  return { user, pass };
}).filter(acc => acc.user && acc.pass);

if (accountList.length === 0) {
  console.log('❌ 账号格式错误，应为 username1:password1,username2:password2');
  process.exit(1);
}

async function sendTelegram(message) {
  if (!token || !chatId) return;

  const now = new Date();
  const hkTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
  const timeStr = hkTime.toISOString().replace('T', ' ').substr(0, 19) + " HKT";

  const fullMessage = `🎉 Netlib 登录通知\n\n登录时间：${timeStr}\n\n${message}`;

  try {
    await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: chatId,
      text: fullMessage
    }, { timeout: 10000 });
    console.log('✅ Telegram 通知发送成功');
  } catch (e) {
    console.log('⚠️ Telegram 发送失败');
  }
}

async function loginWithAccount(user, pass) {
  console.log(`\n🚀 开始登录账号: ${user}`);
  
  const browser = await chromium.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'] 
  });
  
  let page;
  let result = { user, success: false, message: '' };
  
  try {
    page = await browser.newPage();
    page.setDefaultTimeout(45000); 

    // **假设网站访问后直接进入了包含该登录框的页面**
    console.log(`📱 ${user} - 正在访问网站...`);
    await page.goto('https://www.netlib.re/', { waitUntil: 'domcontentloaded' });
    
    // 随机等待 3-5 秒，模拟人工观察页面
    let delayMs = Math.floor(Math.random() * (5000 - 3000 + 1)) + 3000;
    console.log(`⏳ ${user} - 初始页面加载等待 ${delayMs / 1000} 秒...`);
    await new Promise(resolve => setTimeout(resolve, delayMs));

    // **!!! 移除原有的点击“Login”步骤，直接进行表单填写 !!!**
    // 之前点击“Login”失败的原因可能是：该页面已经是登录页，无需再次点击。
    
    console.log(`📝 ${user} - 填写用户名...`);
    // 使用 ID 选择器，最稳定可靠
    await page.locator('#username').fill(user);
    
    // 随机等待 1-2 秒
    await randomDelay(1000, 2000);
    
    console.log(`🔒 ${user} - 填写密码...`);
    // 使用 ID 选择器
    await page.locator('#password').fill(pass);
    
    // 随机等待 1-2 秒
    await randomDelay(1000, 2000);
    
    console.log(`📤 ${user} - 提交登录...`);
    // 使用 Role 选择器点击 “Validate” 按钮
    await page.getByRole('button', { name: 'Validate' }).click(); 
    
    // 等待网络和页面状态稳定
    await page.waitForLoadState('networkidle'); 
    await page.waitForTimeout(5000); // 最后等待 5 秒确认页面跳转
    
    // 检查登录是否成功
    const pageContent = await page.content();
    
    // 这里的成功判断逻辑不变
    if (pageContent.includes('exclusive owner') || pageContent.includes(user)) {
      console.log(`✅ ${user} - 登录成功`);
      result.success = true;
      result.message = `✅ ${user} 登录成功`;
    } else {
      console.log(`❌ ${user} - 登录失败 (页面未显示成功标识)`);
      result.message = `❌ ${user} 登录失败`;
    }
    
  } catch (e) {
    console.log(`❌ ${user} - 登录异常: ${e.message}`);
    result.message = `❌ ${user} 登录异常: ${e.message}`;
  } finally {
    if (page) await page.close();
    await browser.close();
  }
  
  return result;
}

async function main() {
  console.log(`🔍 发现 ${accountList.length} 个账号需要登录`);
  
  const results = [];
  
  for (let i = 0; i < accountList.length; i++) {
    const { user, pass } = accountList[i];
    console.log(`\n📋 处理第 ${i + 1}/${accountList.length} 个账号: ${user}`);
    
    const result = await loginWithAccount(user, pass);
    results.push(result);
    
    // 如果不是最后一个账号，等待一下再处理下一个
    if (i < accountList.length - 1) {
      console.log('⏳ 等待3秒后处理下一个账号...');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
  
  // 汇总所有结果并发送一条消息
  const successCount = results.filter(r => r.success).length;
  const totalCount = results.length;
  
  let summaryMessage = `📊 登录汇总: ${successCount}/${totalCount} 个账号成功\n\n`;
  
  results.forEach(result => {
    summaryMessage += `${result.message}\n`;
  });
  
  await sendTelegram(summaryMessage);
  
  console.log('\n✅ 所有账号处理完成！');
}

main().catch(console.error);
