(function(){
    "use strict";

    const textarea = document.getElementById("intakeText");
    const intakeBox = document.getElementById("intakeBox");
    const cta = document.getElementById("ctaBtn");
    const sampleBtns = Array.from(document.querySelectorAll(".sampleBtn"));

    let sampleSelected = false;

    function setActiveSample(btn){
      sampleBtns.forEach(b => b.classList.remove("isActive"));
      if(btn) btn.classList.add("isActive");
    }

    function clearSampleActive(){
      setActiveSample(null);
      sampleSelected = false;
    }

    function syncStates(){
      const hasValue = textarea.value.trim().length > 0;
      cta.classList.toggle("isHot", hasValue);
      intakeBox.classList.toggle("isFilled", hasValue);
    }

    function onUserEdit(){
      if(sampleSelected) clearSampleActive();
      syncStates();
    }

    textarea.addEventListener("input", onUserEdit);

    /* =========================================================
       샘플 클릭 시 "회색 -> 진한 링" 플리커 제거
       - 버튼이 포커스를 먹어 :focus-within이 잠깐 끊기는 순간이 원인
       - mousedown/touchstart에서 포커스 이동을 차단
       - border/box-shadow transition도 1프레임만 끄고 즉시 적용
    ========================================================= */
    function snapIntakeVisualUpdate(){
      const prevTransition = intakeBox.style.transition;
      intakeBox.style.transition = "none";
      void intakeBox.offsetHeight; // force reflow
      requestAnimationFrame(()=>{ intakeBox.style.transition = prevTransition; });
    }

    /* Sample buttons */
    sampleBtns.forEach((btn)=>{
      // 버튼이 포커스를 가져가지 못하게 해서 textarea의 focus-within 끊김 방지
      btn.addEventListener("mousedown", (e)=>{ e.preventDefault(); });
      btn.addEventListener("touchstart", (e)=>{ e.preventDefault(); }, { passive:false });

      btn.addEventListener("click", ()=>{
        const isAlreadyActive = btn.classList.contains("isActive");

        // 같은 샘플을 다시 클릭한 경우 -> 토글 해제
        if(isAlreadyActive){
          snapIntakeVisualUpdate();
          textarea.value = "";
          textarea.blur();
          clearSampleActive();
          syncStates();
          return;
        }

        // 새로운 샘플 클릭
        const t = btn.getAttribute("data-sample") || "";

        // 플리커 방지: 상태 전환을 "즉시" 스냅
        snapIntakeVisualUpdate();

        // 값 먼저 주입 -> isFilled 즉시 반영
        textarea.value = t;
        syncStates();

        // 포커스는 다음 프레임에 (레이아웃/스타일 적용 후)
        requestAnimationFrame(()=>{
          try{
            textarea.focus({ preventScroll:true });
          }catch(_){
            textarea.focus();
          }
        });

        setActiveSample(btn);
        sampleSelected = true;
      });
    });

    /* Empty input alert */
    cta.addEventListener("click", ()=>{
      const v = textarea.value.trim();
      if(!v){
        alert("Please enter text.");
        textarea.focus();
        return;
      }
      // placeholder action (no-op)
    });

    syncStates();

    /* =========================================================
       (1)(2)(3) Entrance sequence + typewriter
       (이 아래는 기존 로직 그대로)
    ========================================================= */

    /* ===== 속도 조절용 상수 ===== */
    const ENTER_DUR = 500;
    const STEP_GAP  = 200;
    const TW_CHAR_GAP = 10;
    const TW_FADE_DUR = 500;

    const TITLE_PRE_GAP  = 100;
    const TITLE_POST_GAP = 200;

    const brandLogo = document.getElementById("brandLogo");
    const brandline = document.getElementById("brandline");
    const heroSubtitle = document.getElementById("heroSubtitle");
    const sampleRow = document.getElementById("sampleRow");
    const footer = document.getElementById("footer");

    const titleLine1 = document.getElementById("titleLine1");
    const titleLine2 = document.getElementById("titleLine2");

    const TITLE_1 = "Cognitive structure,";
    const TITLE_2 = "referenced as infrastructure rather than output.";
    const SUBTEXT = "A stable reference layer for reasoning structure, designed for comparability beyond outputs.";

    function setEnterDur(el){
      if(!el) return;
      el.style.setProperty("--enterDur", ENTER_DUR + "ms");
    }

    function enterY(el, delayMs){
      if(!el) return;
      setEnterDur(el);
      setTimeout(()=>{ el.classList.add("isIn"); }, delayMs);
    }

    function buildTypeSpans(targetEl, text){
      targetEl.innerHTML = "";
      const chars = Array.from(text);
      chars.forEach((ch)=>{
        const s = document.createElement("span");
        s.className = "twChar";
        s.style.setProperty("--twFadeDur", TW_FADE_DUR + "ms");
        s.textContent = (ch === " ") ? "\u00A0" : ch;
        targetEl.appendChild(s);
      });
      return Array.from(targetEl.querySelectorAll(".twChar"));
    }

    function typeIn(spans, startDelay){
      spans.forEach((sp, i)=>{
        setTimeout(()=>{ sp.classList.add("isOn"); }, startDelay + i * TW_CHAR_GAP);
      });
      return startDelay + spans.length * TW_CHAR_GAP;
    }

    [brandLogo, brandline, heroSubtitle, intakeBox, sampleRow, cta, footer].forEach((el)=>{
      if(!el) return;
      el.classList.add("enterY");
    });

    const t1Spans = buildTypeSpans(titleLine1, TITLE_1);
    const t2Spans = buildTypeSpans(titleLine2, TITLE_2);

    heroSubtitle.textContent = SUBTEXT;

    let t = 80;

    enterY(brandLogo, t);
    t += STEP_GAP;

    enterY(brandline, t);
    t += STEP_GAP + 40;

    t += TITLE_PRE_GAP;

    t = typeIn(t1Spans, t);
    t += 30;
    t = typeIn(t2Spans, t);

    t += TITLE_POST_GAP;

    enterY(heroSubtitle, t);
    t += STEP_GAP;

    enterY(intakeBox, t);
    t += STEP_GAP;

    enterY(sampleRow, t);
    t += STEP_GAP;

    enterY(cta, t);
    t += STEP_GAP;

    enterY(footer, t);
  })();
