function parseQuizFile(text){
  const titleMatch = text.match(/<title>([^<]*)<\/title>/);
  const h1Match = text.match(/<h1>([^<]*)<\/h1>/);
  const suggestedTitle = (h1Match && h1Match[1].trim()) || (titleMatch && titleMatch[1].trim()) || '';

  function countArray(re){
    const m = text.match(re);
    if(!m) return 0;
    try{ return JSON.parse(m[1]).length; }catch(e){}
    try{ return new Function('return ' + m[1])().length; }catch(e){}
    return 0;
  }

  if(/const QUESTIONS\s*=\s*\[/.test(text) && /LEAProgress/.test(text)){
    return { format:'native', questionCount: countArray(/const QUESTIONS = (\[[\s\S]*?\]);/), suggestedTitle };
  }
  if(/const QUIZ_DATA\s*=\s*\[/.test(text) && /function\s+selectOption\s*\(/.test(text) && /function\s+showResults\s*\(/.test(text)){
    return { format:'blueprint', questionCount: countArray(/const QUIZ_DATA = (\[[\s\S]*?\]);/), suggestedTitle };
  }

  // "practice" template — a third self-built quiz shape (seen in e.g. the
  // PreBoard Practice Set style files): const QUESTIONS = [...] with each
  // item's correct option at item.c, plus its own selectAnswer(i, btn) /
  // showResults() functions and a per-run answersLog/order array. Distinct
  // enough from native (needs LEAProgress) and blueprint (needs QUIZ_DATA +
  // selectOption) that it's safe to recognize by name and wire up properly,
  // instead of falling through to the untracked generic case below.
  if(/const QUESTIONS\s*=\s*\[/.test(text) && /function\s+selectAnswer\s*\(/.test(text) && /function\s+showResults\s*\(/.test(text) && /\banswersLog\b/.test(text)){
    return { format:'practice', questionCount: countArray(/const QUESTIONS = (\[[\s\S]*?\]);/), suggestedTitle };
  }

  // Fallback for self-contained quiz files that don't match either known
  // template exactly (different variable/function names, different question
  // object shape, etc). Rather than reject the file, scan every top-level
  // `const NAME = [ ... ];` array literal in the file and accept the first
  // one that "looks like" a set of quiz questions — each item is an object
  // with at least one array property (the options) with 2+ entries. This
  // can't safely wire up LEAProgress (we don't know the file's own
  // answer-checking function names), so it's embedded as-is: no adapter
  // script is appended, progress just won't be tracked for it.
  function looksLikeQuestionArray(arr){
    if(!Array.isArray(arr) || !arr.length) return false;
    return arr.every(item => {
      if(!item || typeof item !== 'object') return false;
      return Object.values(item).some(v => Array.isArray(v) && v.length >= 2);
    });
  }
  const genericRe = /const\s+([A-Za-z_$][\w$]*)\s*=\s*(\[[\s\S]*?\]);/g;
  let genericMatch;
  while((genericMatch = genericRe.exec(text))){
    const literal = genericMatch[2];
    let arr = null;
    try{ arr = JSON.parse(literal); }catch(e){}
    if(!arr){ try{ arr = new Function('return ' + literal)(); }catch(e){} }
    if(looksLikeQuestionArray(arr)){
      return { format:'generic', questionCount: arr.length, suggestedTitle };
    }
  }

  return { format:'unknown', questionCount:0, suggestedTitle };
}


const fs=require('fs'),path=require('path');
for(const f of JSON.parse(process.argv[2])){
  const t=fs.readFileSync(f,'utf8');
  const r=parseQuizFile(t);
  console.log(r.format.padEnd(10), String(r.questionCount).padStart(4),
    /LEAProgress/.test(t)?'tracked ':'UNtracked', path.basename(f));
}
