const fs = require('fs');

function applyToAstro(file) {
  let content = fs.readFileSync(file, 'utf8');
  
  // Add import T
  if (!content.includes('import T ')) {
    content = content.replace('---', '---\nimport T from "../components/i18n/T.astro";');
  }

  // Remove the Korean simultaneous texts manually identified
  content = content.replace(/<p class="mt-1 text-xs text-slate-400">\s*Vision AI와 블록체인 융합 기술 기반 딥테크 인프라\s*<\/p>/g, '');
  content = content.replace(/<p class="text-xs text-slate-400 mb-4">화장품 연구소 우당\(友堂\)네트웍의 신규 앱 서비스<\/p>/g, '');
  
  content = content.replace(/Engineering<br \/>\n\s*<span class="gradient-text">the Visual<\/span><br \/>\n\s*Future./g, 
    '<T en={`Engineering<br /><span class="gradient-text">the Visual</span><br />Future.`} ko={`시각적 미래를<br /><span class="gradient-text">엔지니어링하다.</span>`} vi={`Kỹ thuật<br /><span class="gradient-text">Tương lai</span><br />Thị giác.`} th={`วิศวกรรม<br /><span class="gradient-text">อนาคต</span><br />การมองเห็น`} bn={`ইঞ্জিনিয়ারিং<br /><span class="gradient-text">ভিজ্যুয়াল</span><br />ভবিষ্যত`} ja={`視覚的未来を<br /><span class="gradient-text">エンジニアリング</span><br />する`} zh={`工程化<br /><span class="gradient-text">视觉的</span><br />未来`} />'
  );

  content = content.replace(/Battle-Tested Vision AI Stack/g, '<T en="Battle-Tested Vision AI Stack" ko="검증된 비전 AI 스택" />');
  
  content = content.replace(/ITMOSS builds deep-tech infrastructure that brings\n\s*<strong class="text-slate-700">precision beauty analysis<\/strong> and\n\s*<strong class="text-slate-700">digital portrait rights<\/strong> to life —\n\s*powered by Vision AI and blockchain convergence./g, 
    '<T en={`ITMOSS builds deep-tech infrastructure that brings<br/><strong class="text-slate-700">precision beauty analysis</strong> and <strong class="text-slate-700">digital portrait rights</strong> to life — powered by Vision AI and blockchain convergence.`} ko={`ITMOSS는 비전 AI와 블록체인 융합을 통해 <strong class="text-slate-700">정밀 뷰티 분석</strong>과 <strong class="text-slate-700">디지털 초상권</strong>을 실현하는 딥테크 인프라를 구축합니다.`} />'
  );
  
  content = content.replace(/Explore Stack/g, '<T en="Explore Stack" ko="스택 탐색" />');
  content = content.replace(/Collaborate/g, '<T en="Collaborate" ko="협업하기" />');

  // Stats
  content = content.replace(/"Vision AI"/g, '<T en="Vision AI" ko="비전 AI" />');
  content = content.replace(/"Battle-Tested Stack"/g, '<T en="Battle-Tested Stack" ko="검증된 스택" />');
  content = content.replace(/"Blockchain"/g, '<T en="Blockchain" ko="블록체인" />');
  content = content.replace(/"Kaia \/ Avalanche"/g, '<T en="Kaia / Avalanche" ko="카이아 / 아발란체" />');
  content = content.replace(/"3 Solutions"/g, '<T en="3 Solutions" ko="3가지 솔루션" />');
  content = content.replace(/"Field Verified"/g, '<T en="Field Verified" ko="현장 검증 완료" />');
  content = content.replace(/"450\+ Global Leads"/g, '<T en="450+ Global Leads" ko="450+ 글로벌 리드" />');
  
  // Apply changes
  fs.writeFileSync(file, content);
}

applyToAstro('/Users/jasterjung/go_work/src/itmoss/haepick-agent-core/projects/itmoss-site/src/pages/index.astro');
console.log('Modified index.astro partially');
