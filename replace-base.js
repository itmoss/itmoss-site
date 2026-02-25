const fs = require('fs');
const file = '/Users/jasterjung/go_work/src/itmoss/haepick-agent-core/projects/itmoss-site/src/layouts/BaseLayout.astro';
let content = fs.readFileSync(file, 'utf8');

const headScript = `
    <!-- i18n Script -->
    <script is:inline>
      (function() {
        let lang = localStorage.getItem('i18n-lang');
        if (!lang) {
          const userLang = navigator.language || navigator.userLanguage;
          if (userLang.startsWith('ko')) lang = 'ko';
          else if (userLang.startsWith('vi')) lang = 'vi';
          else if (userLang.startsWith('th')) lang = 'th';
          else if (userLang.startsWith('bn')) lang = 'bn';
          else if (userLang.startsWith('ja')) lang = 'ja';
          else if (userLang.startsWith('zh')) lang = 'zh';
          else lang = 'en';
        }
        document.documentElement.lang = lang;
        window.currentLang = lang;

        window.applyLanguage = function(lang) {
          document.querySelectorAll('.i18n-text').forEach(el => {
            el.innerHTML = el.getAttribute('data-' + lang) || el.getAttribute('data-en');
          });
          document.querySelectorAll('.lang-selector').forEach(sel => {
            if (sel.value !== lang) sel.value = lang;
          });
        };

        document.addEventListener('DOMContentLoaded', () => {
          window.applyLanguage(window.currentLang);
          document.querySelectorAll('.lang-selector').forEach(sel => {
            sel.addEventListener('change', (e) => {
              const newLang = e.target.value;
              localStorage.setItem('i18n-lang', newLang);
              document.documentElement.lang = newLang;
              window.currentLang = newLang;
              window.applyLanguage(newLang);
            });
          });
        });
      })();
    </script>
`;

content = content.replace('</title>', '</title>' + headScript);

const navAdd = `
          <select class="lang-selector bg-slate-100 border-none text-slate-600 text-xs rounded-lg px-2 py-1 outline-none">
            <option value="en">English</option>
            <option value="ko">한국어</option>
            <option value="vi">Tiếng Việt</option>
            <option value="th">ไทย</option>
            <option value="bn">বাংলা</option>
            <option value="ja">日本語</option>
            <option value="zh">中文</option>
          </select>
`;

content = content.replace('<a href="/contact" class="btn btn-primary text-xs px-4 py-2">', navAdd + '\n          <a href="/contact" class="btn btn-primary text-xs px-4 py-2">');

const mobileNavAdd = `
        <div class="px-3 py-2 border-t border-slate-100 mt-2 pt-2">
          <select class="lang-selector w-full bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-xl px-3 py-2 outline-none">
            <option value="en">English (EN)</option>
            <option value="ko">한국어 (KO)</option>
            <option value="vi">Tiếng Việt (VI)</option>
            <option value="th">ไทย (TH)</option>
            <option value="bn">বাংলা (BN)</option>
            <option value="ja">日本語 (JA)</option>
            <option value="zh">中文 (ZH)</option>
          </select>
        </div>
`;

content = content.replace('</a>\n      </div>\n    </header>', '</a>\n' + mobileNavAdd + '      </div>\n    </header>');

fs.writeFileSync(file, content);
