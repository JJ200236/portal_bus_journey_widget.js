(function () {
  'use strict';

  // ==================================================
  // 設定エリア：環境に合わせて変更してください
  // ==================================================
  const CONFIG = {
    APP_ID: 33, // ★★★ 対象アプリのID (バス乗車記録アプリ等のID)

    // 絞り込み条件
    STATUS_FIELD: 'ステータス',         // プロセス管理のステータスフィールドコード
    TARGET_STATUSES: ['実施確定', '実行中'], // 対象とするステータス

    // ソート基準
    SORT_FIELD: 'travel_code',       // ★★★ ソートに使う文字列フィールドのコード (例: ⓪－０１ などの値が入るフィールド)

    // 表示する情報のフィールドコード
    DISP_SINGLE_LINE: 'route_name_0',    // ★★★ 文字列(1行)フィールド (例: 路線名、件名)
    DISP_MULTI_LINE: 'bus_info_simple',        // ★★★ 文字列(複数行)フィールド (例: 備考、詳細)
    DISP_DATE: 'execution_date',       // ★★★ 日付フィールド (例: 運行日)

    // ★★★ 追加: 表示するフィールド (ご利用のフィールドコードに書き換えてください)
    DISP_DAY_NUM: 'days',          // ★★★ 何日目かを示す「数値」フィールド
    DISP_TRIP_NUM: 'bus_count_each_day', // ★★★ その日の何本目かを示す「数値」フィールド
    DISP_JOURNEY_PART: 'section',   // ★★★ 全体の旅程における位置づけを示す「ドロップダウン」フィールド

    // ★★★ サブテーブル設定（次のバス停取得用）
    SUBTABLE_FIELD: 'passed_stops',     // サブテーブルのフィールドコード
    SUB_TIME_FIELD: 'passed_time',      // サブテーブル内の時刻フィールドコード
    SUB_NAME_FIELD: 'passed_stop_name', // サブテーブル内のバス停名フィールドコード
  };
  // ==================================================

  const events = ['portal.show', 'mobile.portal.show'];

  kintone.events.on(events, async function (event) {
    const isMobile = event.type.startsWith('mobile.');
    
    // ポータルのコンテンツスペースを取得
    const spaceEl = isMobile 
      ? kintone.mobile.portal.getContentSpaceElement() 
      : kintone.portal.getContentSpaceElement();

    if (!spaceEl) return event;

    // 既に表示済みなら重複作成しない
    if (document.getElementById('portal-task-widget')) return event;

    // アプリ情報を取得してアプリ名を取得
    let appName = `アプリ(ID: ${CONFIG.APP_ID})`; // デフォルト名
    try {
      const appInfo = await kintone.api(kintone.api.url('/k/v1/app.json', true), 'GET', { id: CONFIG.APP_ID });
      if (appInfo.name) {
        appName = appInfo.name;
      }
    } catch (e) {
      console.error('アプリ情報の取得に失敗しました:', e);
      // エラーでも処理は続行する
    }

    // データ取得
    const records = await fetchTargetRecords();
    if (!records || records.length === 0) return event;

    // ウィジェット作成・表示
    const widget = createWidget(records, isMobile, appName);
    spaceEl.appendChild(widget);

    return event;
  });

  /**
   * 対象レコードを取得する関数
   */
  async function fetchTargetRecords() {
    // ステータスが対象に含まれ、指定の数値フィールドで昇順ソートし、上位2件を取得
    const query = `${CONFIG.STATUS_FIELD} in ("${CONFIG.TARGET_STATUSES.join('","')}") order by ${CONFIG.SORT_FIELD} asc limit 2`;
    
    const body = {
      app: CONFIG.APP_ID,
      query: query,
      fields: ['$id', CONFIG.STATUS_FIELD, CONFIG.SORT_FIELD, CONFIG.DISP_SINGLE_LINE, CONFIG.DISP_MULTI_LINE, CONFIG.DISP_DATE, CONFIG.SUBTABLE_FIELD, CONFIG.DISP_DAY_NUM, CONFIG.DISP_TRIP_NUM, CONFIG.DISP_JOURNEY_PART]
    };
    
    try {
      const resp = await kintone.api(kintone.api.url('/k/v1/records.json', true), 'GET', body);
      return resp.records;
    } catch (e) {
      console.error('ポータル表示用データ取得エラー:', e);
      return [];
    }
  }

  /**
   * 表示用ウィジェットを作成する関数
   */
  function createWidget(records, isMobile, appName) {
    const container = document.createElement('div');
    container.id = 'portal-task-widget';
    
    // 全体のコンテナスタイル
    container.style.cssText = isMobile ? 
      'padding: 10px; color: #333; width: 100%; box-sizing: border-box;' : 
      'padding: 0 0 20px 0; color: #333; margin-bottom: 20px;';
    
    const mainTaskGroup = document.createElement('div');

    // ウィジェット全体のヘッダー（アプリ名表示）
    const widgetHeader = document.createElement('div');
    widgetHeader.textContent = `■ ${appName} の行程`;

    if (isMobile) {
      mainTaskGroup.style.cssText = 'margin-bottom: 15px; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); background: #fff;';
      widgetHeader.style.cssText = 'padding: 10px 15px; font-size: 12px; color: #777; border-bottom: 1px solid #eee;';
    } else {
      mainTaskGroup.style.marginBottom = '15px';
      widgetHeader.style.cssText = 'font-size: 12px; color: #777; margin-bottom: -1px; padding: 5px 10px; background-color: #f1f1f1; border: 1px solid #ddd; border-bottom: none; border-radius: 4px 4px 0 0;';
    }
    mainTaskGroup.appendChild(widgetHeader);

    // --- 1件目 (メインアクション: 最も値が低いレコード) ---
    const current = records[0];
    const currentCard = document.createElement('div');
    
    // モバイル版: カード型で見やすく / PC版: 左線付きのデザイン
    const cardStyle = isMobile ? 
      'padding: 15px;' : 
      'padding: 15px; background: #fff; border: 1px solid #ddd; border-top: none; border-left: 5px solid #3498db;';
    
    currentCard.style.cssText = cardStyle;
    
    // タイトル
    const title = document.createElement('div');
    title.style.cssText = 'font-weight: bold; font-size: 1.1em; margin-bottom: 8px; color: #2c3e50;';
    const singleTextVal = current[CONFIG.DISP_SINGLE_LINE]?.value || '(件名なし)';
    title.textContent = `▶ 次の行程: ${singleTextVal}`;
    
    // 情報エリア
    const info = document.createElement('div');
    info.style.fontSize = '0.9em';
    info.style.marginBottom = '12px';
    info.style.color = '#555';
    
    const dateVal = current[CONFIG.DISP_DATE]?.value || '-';
    const statusVal = current[CONFIG.STATUS_FIELD]?.value;
    
    // 追加情報を取得
    const dayNum = current[CONFIG.DISP_DAY_NUM]?.value;
    const tripNum = current[CONFIG.DISP_TRIP_NUM]?.value;
    const journeyPart = current[CONFIG.DISP_JOURNEY_PART]?.value;
    let journeyInfo = '';
    if (dayNum || tripNum || journeyPart) {
        const dayStr = dayNum ? `${dayNum}日目` : '';
        const tripStr = tripNum ? `${tripNum}本目` : '';
        const journeyPartStr = journeyPart ? `(${journeyPart})` : '';
        journeyInfo = `<div style="margin-bottom:8px; font-weight:bold; color: #3498db;">${dayStr} ${tripStr} ${journeyPartStr}</div>`;
    }

    // 複数行テキストの処理 (モバイル版は長すぎないようにカット)
    let multiText = current[CONFIG.DISP_MULTI_LINE]?.value || '';
    if (isMobile && multiText.length > 60) {
      multiText = multiText.substring(0, 60) + '...';
    } else if (!isMobile && multiText.length > 200) {
       multiText = multiText.substring(0, 200) + '...';
    }

    // 次のバス停を特定
    let nextStopInfo = '';
    const subtable = current[CONFIG.SUBTABLE_FIELD]?.value;
    if (subtable && Array.isArray(subtable)) {
        const targetRow = subtable.find(row => !row.value[CONFIG.SUB_TIME_FIELD].value);
        if (targetRow) {
            const stopName = targetRow.value[CONFIG.SUB_NAME_FIELD].value;
            nextStopInfo = `<div style="margin-bottom:8px; font-weight:bold; color: #e67e22;">▶ 次のバス停: ${stopName}</div>`;
        } else {
            nextStopInfo = `<div style="margin-bottom:8px; color: #27ae60;">(全行程完了)</div>`;
        }
    }
    
    info.innerHTML = `
      <div style="display:flex; justify-content:space-between; margin-bottom:6px; flex-wrap: wrap;">
        <span style="margin-right:10px;">日付: ${dateVal}</span>
        <span style="font-weight:bold; color:#e67e22;">${statusVal}</span>
      </div>
      ${journeyInfo}
      ${nextStopInfo}
      <div style="white-space: pre-wrap; background:#f9f9f9; padding:8px; border-radius:4px; font-size: 0.9em; color: #333;">${multiText || '(詳細なし)'}</div>
    `;

    // アクションボタン (編集画面へ)
    const btnArea = document.createElement('div');
    btnArea.style.textAlign = 'right';
    
    const linkBtn = document.createElement('a');
    // モバイル版URLとPC版URLの振り分け (kintoneの仕様上 /k/APPID/edit... は共通で使えることが多いが、モバイル専用URLを意識する場合)
    // ここでは標準的なURL生成を使用
    linkBtn.href = `/k/${CONFIG.APP_ID}/show#record=${current.$id.value}&mode=edit`;
    linkBtn.textContent = '編集画面を開く';
    linkBtn.style.cssText = `
      display: inline-block; text-decoration: none; background: #3498db; color: #fff; 
      padding: 10px 20px; border-radius: 4px; font-weight: bold; font-size: 14px;
      box-shadow: 0 2px 2px rgba(0,0,0,0.1);
    `;
    
    btnArea.appendChild(linkBtn);
    currentCard.appendChild(title);
    currentCard.appendChild(info);
    currentCard.appendChild(btnArea);
    mainTaskGroup.appendChild(currentCard);
    container.appendChild(mainTaskGroup);

    // --- 2件目 (予告: 2番目に値が低いレコード) ---
    if (records.length > 1) {
      const next = records[1];
      const nextCard = document.createElement('div');
      
      // 予告は少し控えめなデザイン
      const nextStyle = isMobile ?
        'padding: 12px; background: #ecf0f1; border-radius: 8px; font-size: 0.9em; color: #7f8c8d;' :
        'padding: 10px 15px; background: #f9f9f9; border: 1px solid #eee; border-left: 5px solid #95a5a6; color: #666;';
        
      nextCard.style.cssText = nextStyle;
      
      const nextTitle = next[CONFIG.DISP_SINGLE_LINE]?.value || '(件名なし)';
      const nextDate = next[CONFIG.DISP_DATE]?.value || '-';
      
      // ごちゃごちゃしないよう、タイトルと日付・ステータスのみ表示
      nextCard.innerHTML = `
        <div style="font-weight:bold; margin-bottom:4px; color:#555;">▼ 予告 (次の行程)</div>
        <div style="display:flex; flex-direction: column; gap: 2px;">
          <span style="font-weight:bold; font-size:1.05em;">${nextTitle}</span>
          <div style="display:flex; gap:15px; font-size:0.9em; margin-top:2px;">
            <span>日付: ${nextDate}</span>
            <span>状態: ${next[CONFIG.STATUS_FIELD]?.value}</span>
          </div>
        </div>
      `;
      
      container.appendChild(nextCard);
    }

    return container;
  }

})();
