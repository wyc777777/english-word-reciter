// ==================== 内置词根 / 词缀库 ====================
// 目标：不联网也能把大多数考研/雅思单词拆开，配合 AI 拆解作为兜底与增强。
// 数据格式：[片段, 类型, 中文含义]
//   类型 p = 前缀(prefix)  r = 词根(root)  s = 后缀(suffix)
// 匹配规则：前缀必须出现在词首，后缀必须出现在词尾，词根可出现在任意位置。

const RAW_ROOTS = [
  // ---------- 前缀 ----------
  ['a', 'p', '无，非；处于…状态'],
  ['ab', 'p', '离开，相反；从'],
  ['abs', 'p', '离开，分离'],
  ['ad', 'p', '朝向，附加'],
  ['anti', 'p', '反对，对抗'],
  ['ante', 'p', '之前'],
  ['auto', 'p', '自己，自动'],
  ['be', 'p', '使…，加强'],
  ['bi', 'p', '二，双'],
  ['bio', 'p', '生命'],
  ['by', 'p', '旁，副'],
  ['circum', 'p', '围绕'],
  ['co', 'p', '共同，一起'],
  ['col', 'p', '共同，一起'],
  ['com', 'p', '共同，一起；加强'],
  ['con', 'p', '共同，一起；加强'],
  ['contra', 'p', '相反，对立'],
  ['counter', 'p', '相反，对抗'],
  ['de', 'p', '向下；去除；离开；加强'],
  ['di', 'p', '二，双；分开'],
  ['dia', 'p', '穿过，两者之间'],
  ['dis', 'p', '不，否定；分开'],
  ['dys', 'p', '不良，困难'],
  ['e', 'p', '向外；去除'],
  ['ef', 'p', '向外'],
  ['em', 'p', '进入；使…'],
  ['en', 'p', '进入；使…'],
  ['epi', 'p', '在…之上，在…之后'],
  ['eu', 'p', '好，优'],
  ['ex', 'p', '向外；前任；出'],
  ['extra', 'p', '超出，之外'],
  ['fore', 'p', '前面，预先'],
  ['hetero', 'p', '异，不同'],
  ['homo', 'p', '同，相同'],
  ['hyper', 'p', '超过，过度'],
  ['hypo', 'p', '下面，不足'],
  ['il', 'p', '不，否定；进入'],
  ['im', 'p', '不，否定；进入'],
  ['in', 'p', '不，否定；进入，使'],
  ['infra', 'p', '下方，低于'],
  ['inter', 'p', '在…之间，相互'],
  ['intra', 'p', '内部'],
  ['intro', 'p', '向内'],
  ['ir', 'p', '不，否定'],
  ['macro', 'p', '大，宏'],
  ['mal', 'p', '坏，恶'],
  ['micro', 'p', '小，微'],
  ['mis', 'p', '错，坏；否定'],
  ['mono', 'p', '单，一'],
  ['multi', 'p', '多'],
  ['neo', 'p', '新'],
  ['non', 'p', '非，不'],
  ['ob', 'p', '相反，朝向；阻碍'],
  ['out', 'p', '超过，外'],
  ['over', 'p', '过度，在上方'],
  ['para', 'p', '并列；辅助；防止'],
  ['per', 'p', '贯穿，完全'],
  ['peri', 'p', '周围'],
  ['poly', 'p', '多'],
  ['post', 'p', '之后'],
  ['pre', 'p', '之前，预先'],
  ['pro', 'p', '向前；赞成；代替'],
  ['pseudo', 'p', '假，伪'],
  ['re', 'p', '回，再，反复'],
  ['retro', 'p', '向后'],
  ['semi', 'p', '半'],
  ['sub', 'p', '下面；次，亚'],
  ['suc', 'p', '下面，随后'],
  ['suf', 'p', '下面'],
  ['super', 'p', '上面；超级'],
  ['sur', 'p', '超过，在上面'],
  ['syn', 'p', '共同，一起'],
  ['sym', 'p', '共同，一起'],
  ['trans', 'p', '横跨，转变'],
  ['tri', 'p', '三'],
  ['ultra', 'p', '极端，超'],
  ['un', 'p', '不，否定；相反动作'],
  ['under', 'p', '下面；不足'],
  ['uni', 'p', '单一'],
  ['up', 'p', '向上'],
  ['vice', 'p', '副，代理'],
  ['with', 'p', '向后，相对'],

  // ---------- 常见词根 ----------
  ['acid', 'r', '酸，尖'],
  ['act', 'r', '做，行动'],
  ['aer', 'r', '空气，空中'],
  ['ag', 'r', '做，驱动'],
  ['agon', 'r', '挣扎，竞赛'],
  ['ali', 'r', '别的，其他'],
  ['alter', 'r', '改变，其他'],
  ['am', 'r', '爱'],
  ['ambul', 'r', '行走'],
  ['ampl', 'r', '大，宽'],
  ['anim', 'r', '生命，精神'],
  ['ann', 'r', '年'],
  ['anthrop', 'r', '人，人类'],
  ['apt', 'r', '适合，能力'],
  ['aqu', 'r', '水'],
  ['arch', 'r', '统治；首要；建筑'],
  ['arm', 'r', '武器'],
  ['art', 'r', '技艺'],
  ['aster', 'r', '星'],
  ['astro', 'r', '星'],
  ['aud', 'r', '听'],
  ['audit', 'r', '听'],
  ['aug', 'r', '增加'],
  ['augment', 'r', '增大'],
  ['author', 'r', '创造者，权威'],
  ['bar', 'r', '重量，障碍'],
  ['base', 'r', '低，基础'],
  ['bat', 'r', '打，击'],
  ['bell', 'r', '战争'],
  ['bene', 'r', '好，善'],
  ['brev', 'r', '短'],
  ['cad', 'r', '落下'],
  ['calor', 'r', '热'],
  ['camp', 'r', '田野，营地'],
  ['cand', 'r', '白，发光'],
  ['cant', 'r', '唱'],
  ['cap', 'r', '拿，抓；头'],
  ['capt', 'r', '拿，抓'],
  ['cip', 'r', '拿，抓'],
  ['cept', 'r', '拿，取'],
  ['ceive', 'r', '拿，取'],
  ['cup', 'r', '拿，抓'],
  ['card', 'r', '心'],
  ['carn', 'r', '肉'],
  ['cast', 'r', '投掷'],
  ['caus', 'r', '原因'],
  ['caut', 'r', '小心'],
  ['ced', 'r', '走，让步'],
  ['ceed', 'r', '走，行进'],
  ['cess', 'r', '走，停止'],
  ['celer', 'r', '快速'],
  ['cent', 'r', '百；中心'],
  ['centr', 'r', '中心'],
  ['cert', 'r', '确定'],
  ['chron', 'r', '时间'],
  ['cid', 'r', '落下；切'],
  ['cis', 'r', '切，割'],
  ['cite', 'r', '召唤，激发'],
  ['civ', 'r', '公民'],
  ['claim', 'r', '呼喊，主张'],
  ['clam', 'r', '呼喊'],
  ['clar', 'r', '清楚'],
  ['class', 'r', '等级，类别'],
  ['clin', 'r', '倾斜'],
  ['clud', 'r', '关闭'],
  ['clus', 'r', '关闭'],
  ['cogn', 'r', '知道'],
  ['corp', 'r', '身体'],
  ['cosm', 'r', '宇宙，秩序'],
  ['cracy', 'r', '统治，权力'],
  ['cred', 'r', '相信'],
  ['cre', 'r', '生长，创造'],
  ['cresc', 'r', '生长'],
  ['cret', 'r', '分离，辨别'],
  ['crimin', 'r', '罪行，指控'],
  ['crit', 'r', '判断，批评'],
  ['cruc', 'r', '十字'],
  ['cru', 'r', '十字；粗野'],
  ['cub', 'r', '躺，卧'],
  ['cult', 'r', '耕种，培养'],
  ['cur', 'r', '关心；跑'],
  ['curs', 'r', '跑，流动'],
  ['cycl', 'r', '圆，循环'],
  ['dec', 'r', '十；适当'],
  ['dem', 'r', '人民'],
  ['demo', 'r', '人民'],
  ['dent', 'r', '牙齿'],
  ['noc', 'r', '伤害，毒'],
  ['tempor', 'r', '时间'],
  ['derm', 'r', '皮肤'],
  ['dict', 'r', '说，宣告'],
  ['doc', 'r', '教'],
  ['domin', 'r', '统治，主人'],
  ['don', 'r', '给予'],
  ['dorm', 'r', '睡眠'],
  ['dox', 'r', '观点'],
  ['duc', 'r', '引导'],
  ['duct', 'r', '引导'],
  ['dur', 'r', '持续，坚硬'],
  ['dyn', 'r', '力量'],
  ['eco', 'r', '家，生态'],
  ['electr', 'r', '电'],
  ['em', 'r', '拿，取'],
  ['empt', 'r', '拿，取'],
  ['equ', 'r', '相等'],
  ['erg', 'r', '工作，功'],
  ['err', 'r', '漫游，犯错'],
  ['ev', 'r', '时代，年龄'],
  ['fab', 'r', '说，编造'],
  ['fac', 'r', '做，制作'],
  ['fact', 'r', '做，制作'],
  ['fect', 'r', '做，制作'],
  ['fic', 'r', '做，制作'],
  ['feat', 'r', '做，功绩'],
  ['fall', 'r', '欺骗，落下'],
  ['fam', 'r', '名声；饥饿'],
  ['fer', 'r', '带，拿；产生'],
  ['ferv', 'r', '沸腾，热'],
  ['fid', 'r', '信任'],
  ['fig', 'r', '塑造，形状'],
  ['fil', 'r', '线；子女'],
  ['fin', 'r', '结束，界限'],
  ['firm', 'r', '坚定'],
  ['fix', 'r', '固定'],
  ['flam', 'r', '火焰'],
  ['flat', 'r', '吹'],
  ['flect', 'r', '弯曲'],
  ['flex', 'r', '弯曲'],
  ['flict', 'r', '打击'],
  ['flor', 'r', '花'],
  ['flu', 'r', '流动'],
  ['flux', 'r', '流动'],
  ['form', 'r', '形状，形成'],
  ['fort', 'r', '强，力量'],
  ['fract', 'r', '打破'],
  ['frag', 'r', '打破'],
  ['frater', 'r', '兄弟'],
  ['fug', 'r', '逃跑'],
  ['fund', 'r', '基础，倾倒'],
  ['fus', 'r', '倾倒，融合'],
  ['gen', 'r', '产生，种族'],
  ['gest', 'r', '携带，运送'],
  ['gnos', 'r', '知道'],
  ['gon', 'r', '角'],
  ['grad', 'r', '步，走，等级'],
  ['gress', 'r', '行走'],
  ['gram', 'r', '写，记录'],
  ['graph', 'r', '写，记录'],
  ['grat', 'r', '感激，愉快'],
  ['grav', 'r', '重'],
  ['greg', 'r', '群体'],
  ['gubern', 'r', '治理'],
  ['habit', 'r', '居住，习惯'],
  ['hal', 'r', '呼吸'],
  ['hap', 'r', '机会，运气'],
  ['heli', 'r', '太阳'],
  ['hemo', 'r', '血'],
  ['her', 'r', '继承；粘着'],
  ['hes', 'r', '粘着'],
  ['hibit', 'r', '持有，拿'],
  ['hospit', 'r', '客人，招待'],
  ['host', 'r', '客人，敌人'],
  ['hum', 'r', '地，人；湿'],
  ['hydr', 'r', '水'],
  ['idea', 'r', '思想，观念'],
  ['insul', 'r', '岛屿'],
  ['integr', 'r', '完整'],
  ['it', 'r', '走'],
  ['ject', 'r', '投掷'],
  ['join', 'r', '连接'],
  ['junct', 'r', '连接'],
  ['jur', 'r', '法律，发誓'],
  ['just', 'r', '公正'],
  ['labor', 'r', '劳动'],
  ['laps', 'r', '滑，落'],
  ['lat', 'r', '搬运，携带'],
  ['later', 'r', '边'],
  ['lax', 'r', '松'],
  ['lect', 'r', '选择；读；说'],
  ['leg', 'r', '法律；读；派遣'],
  ['lev', 'r', '举起；轻'],
  ['liber', 'r', '自由'],
  ['libr', 'r', '书；称量'],
  ['lic', 'r', '允许'],
  ['lig', 'r', '绑，选择'],
  ['limit', 'r', '界限'],
  ['line', 'r', '线'],
  ['lingu', 'r', '语言；舌'],
  ['liter', 'r', '文字'],
  ['lith', 'r', '石'],
  ['loc', 'r', '地方'],
  ['log', 'r', '说话，学问'],
  ['logue', 'r', '说话'],
  ['loqu', 'r', '说话'],
  ['locut', 'r', '说话'],
  ['luc', 'r', '光'],
  ['lum', 'r', '光'],
  ['lumin', 'r', '光'],
  ['lud', 'r', '玩，戏弄'],
  ['lus', 'r', '玩，戏弄'],
  ['magn', 'r', '大'],
  ['maj', 'r', '大'],
  ['man', 'r', '手'],
  ['manu', 'r', '手'],
  ['mand', 'r', '命令，委托'],
  ['mari', 'r', '海'],
  ['mark', 'r', '标记，边界'],
  ['mater', 'r', '母亲'],
  ['matr', 'r', '母亲'],
  ['medi', 'r', '中间'],
  ['med', 'r', '治疗'],
  ['melan', 'r', '黑'],
  ['mem', 'r', '记忆'],
  ['mend', 'r', '修补'],
  ['mens', 'r', '测量'],
  ['ment', 'r', '心智'],
  ['merc', 'r', '贸易，报酬'],
  ['merg', 'r', '沉，浸'],
  ['meter', 'r', '测量'],
  ['metr', 'r', '测量'],
  ['micro', 'r', '小'],
  ['migr', 'r', '迁移'],
  ['milit', 'r', '士兵，战斗'],
  ['min', 'r', '小；突出'],
  ['mir', 'r', '惊奇，看'],
  ['miss', 'r', '送，放'],
  ['mit', 'r', '送，放'],
  ['mod', 'r', '方式，尺度'],
  ['mon', 'r', '警告；单独'],
  ['monstr', 'r', '展示'],
  ['morph', 'r', '形态'],
  ['mort', 'r', '死'],
  ['mov', 'r', '移动'],
  ['mob', 'r', '移动'],
  ['mot', 'r', '移动'],
  ['mun', 'r', '公共，服务'],
  ['mut', 'r', '改变'],
  ['nat', 'r', '出生'],
  ['nav', 'r', '船，航行'],
  ['nect', 'r', '连接'],
  ['neg', 'r', '否定'],
  ['neur', 'r', '神经'],
  ['nomin', 'r', '名字'],
  ['norm', 'r', '标准，规范'],
  ['not', 'r', '知道，标记'],
  ['nov', 'r', '新'],
  ['numer', 'r', '数'],
  ['nunci', 'r', '宣告'],
  ['nutri', 'r', '滋养'],
  ['ocul', 'r', '眼'],
  ['onym', 'r', '名字'],
  ['oper', 'r', '工作'],
  ['opt', 'r', '选择；视线'],
  ['ora', 'r', '说，祈求'],
  ['ord', 'r', '秩序'],
  ['ordin', 'r', '秩序'],
  ['ori', 'r', '升起，开始'],
  ['orn', 'r', '装饰'],
  ['oss', 'r', '骨'],
  ['pac', 'r', '和平；安抚'],
  ['pain', 'r', '面包'],
  ['paleo', 'r', '古老'],
  ['par', 'r', '平等；出现；生'],
  ['part', 'r', '部分，分开'],
  ['pass', 'r', '通过；感情'],
  ['pater', 'r', '父亲'],
  ['path', 'r', '感情，疾病'],
  ['pat', 'r', '承受，忍受'],
  ['ped', 'r', '脚；儿童'],
  ['pod', 'r', '脚'],
  ['pel', 'r', '推，驱'],
  ['puls', 'r', '推，驱'],
  ['pend', 'r', '悬挂；称量；花费'],
  ['pens', 'r', '悬挂；称量；花费'],
  ['phil', 'r', '爱'],
  ['phob', 'r', '恐惧'],
  ['phon', 'r', '声音'],
  ['phot', 'r', '光'],
  ['pict', 'r', '画，描绘'],
  ['plac', 'r', '取悦，平静'],
  ['plaint', 'r', '抱怨'],
  ['plan', 'r', '平，计划'],
  ['plant', 'r', '种植'],
  ['plaud', 'r', '拍手，赞扬'],
  ['plaus', 'r', '拍手，赞扬'],
  ['ple', 'r', '填满'],
  ['plet', 'r', '填满'],
  ['plic', 'r', '折叠'],
  ['ply', 'r', '折叠'],
  ['plor', 'r', '哭喊，探求'],
  ['point', 'r', '点，刺'],
  ['pol', 'r', '城市，政治'],
  ['polit', 'r', '城市，政治'],
  ['pon', 'r', '放，放置'],
  ['pos', 'r', '放，放置'],
  ['posit', 'r', '放，放置'],
  ['popul', 'r', '人民'],
  ['port', 'r', '搬运，港口'],
  ['portion', 'r', '部分'],
  ['pot', 'r', '力量，能够'],
  ['prec', 'r', '价值，祈求'],
  ['prehend', 'r', '抓住'],
  ['press', 'r', '压'],
  ['prim', 'r', '第一，首要'],
  ['prin', 'r', '第一'],
  ['pris', 'r', '抓住，取得'],
  ['priv', 'r', '私有，剥夺'],
  ['prob', 'r', '证明，试验'],
  ['prov', 'r', '证明'],
  ['psych', 'r', '心灵，精神'],
  ['publ', 'r', '公开，人民'],
  ['pugn', 'r', '打，战斗'],
  ['punct', 'r', '点，刺'],
  ['pur', 'r', '纯净'],
  ['pute', 'r', '思考，计算'],
  ['quer', 'r', '寻求，询问'],
  ['quest', 'r', '寻求'],
  ['quir', 'r', '寻求'],
  ['quisit', 'r', '寻求'],
  ['quiet', 'r', '安静'],
  ['radi', 'r', '射线，根'],
  ['rap', 'r', '夺取'],
  ['rapt', 'r', '夺取'],
  ['rat', 'r', '计算，理性'],
  ['rect', 'r', '正，直；统治'],
  ['reg', 'r', '统治，直'],
  ['rid', 'r', '笑'],
  ['ris', 'r', '笑'],
  ['riv', 'r', '河流'],
  ['rod', 'r', '咬，啃'],
  ['ros', 'r', '咬，啃'],
  ['rog', 'r', '问，请求'],
  ['rot', 'r', '轮，转'],
  ['rupt', 'r', '断裂'],
  ['sacr', 'r', '神圣'],
  ['sanct', 'r', '神圣'],
  ['sal', 'r', '盐；健康'],
  ['sati', 'r', '足够，满足'],
  ['sci', 'r', '知道'],
  ['scrib', 'r', '写'],
  ['script', 'r', '写'],
  ['sect', 'r', '切，割'],
  ['secut', 'r', '跟随'],
  ['sequ', 'r', '跟随'],
  ['sed', 'r', '坐'],
  ['sess', 'r', '坐'],
  ['sid', 'r', '坐'],
  ['sens', 'r', '感觉'],
  ['sent', 'r', '感觉'],
  ['sign', 'r', '标记，符号'],
  ['simil', 'r', '相似'],
  ['simul', 'r', '相似；同时'],
  ['sist', 'r', '站立'],
  ['sta', 'r', '站立'],
  ['stant', 'r', '站立'],
  ['stit', 'r', '站立，放置'],
  ['soci', 'r', '同伴，社会'],
  ['sol', 'r', '太阳；单独；安慰'],
  ['solv', 'r', '松开，解决'],
  ['solu', 'r', '松开'],
  ['somn', 'r', '睡眠'],
  ['son', 'r', '声音'],
  ['soph', 'r', '智慧'],
  ['spec', 'r', '看'],
  ['spect', 'r', '看'],
  ['spic', 'r', '看'],
  ['spir', 'r', '呼吸，精神'],
  ['spond', 'r', '承诺，回应'],
  ['spons', 'r', '承诺'],
  ['stinct', 'r', '刺，区分'],
  ['string', 'r', '拉紧，捆绑'],
  ['strict', 'r', '拉紧'],
  ['stru', 'r', '建造'],
  ['struct', 'r', '建造'],
  ['suad', 'r', '劝告'],
  ['suas', 'r', '劝告'],
  ['sume', 'r', '拿，取'],
  ['sumpt', 'r', '拿，取'],
  ['tact', 'r', '接触'],
  ['tang', 'r', '接触'],
  ['ting', 'r', '接触'],
  ['tain', 'r', '持有，保持'],
  ['ten', 'r', '持有'],
  ['tin', 'r', '持有'],
  ['tect', 'r', '覆盖'],
  ['tele', 'r', '远'],
  ['temper', 'r', '调节，节制'],
  ['tempt', 'r', '尝试'],
  ['tend', 'r', '伸展'],
  ['tens', 'r', '伸展'],
  ['tent', 'r', '伸展；持有'],
  ['termin', 'r', '界限，结束'],
  ['terr', 'r', '土地；恐惧'],
  ['long', 'r', '长'],
  ['time', 'r', '时间'],
  ['place', 'r', '地方，放置'],
  ['people', 'r', '人民'],
  ['work', 'r', '工作'],
  ['move', 'r', '移动'],
  ['hand', 'r', '手'],
  ['way', 'r', '路，方式'],
  ['new', 'r', '新'],
  ['old', 'r', '老，旧'],
  ['good', 'r', '好'],
  ['bad', 'r', '坏'],
  ['high', 'r', '高'],
  ['child', 'r', '儿童'],
  ['heart', 'r', '心'],
  ['mind', 'r', '心智，思想'],
  ['light', 'r', '光'],
  ['test', 'r', '作证，测试'],
  ['text', 'r', '编织'],
  ['the', 'r', '神'],
  ['theo', 'r', '神'],
  ['therm', 'r', '热'],
  ['tim', 'r', '害怕'],
  ['tir', 'r', '拉'],
  ['tom', 'r', '切，割'],
  ['tort', 'r', '扭，折磨'],
  ['tors', 'r', '扭'],
  ['tox', 'r', '毒'],
  ['tract', 'r', '拉，拖'],
  ['tray', 'r', '拉'],
  ['trib', 'r', '给予，分配'],
  ['tribut', 'r', '给予'],
  ['turb', 'r', '搅动，混乱'],
  ['typ', 'r', '类型，印记'],
  ['umbr', 'r', '阴影'],
  ['und', 'r', '波浪，充满'],
  ['urb', 'r', '城市'],
  ['us', 'r', '使用'],
  ['util', 'r', '使用'],
  ['vac', 'r', '空'],
  ['van', 'r', '空'],
  ['vad', 'r', '走'],
  ['vas', 'r', '走'],
  ['val', 'r', '价值，强'],
  ['vari', 'r', '变化'],
  ['ven', 'r', '来'],
  ['vent', 'r', '来'],
  ['ver', 'r', '真实'],
  ['verb', 'r', '词语'],
  ['verg', 'r', '倾斜'],
  ['vers', 'r', '转'],
  ['vert', 'r', '转'],
  ['vest', 'r', '衣服；授予'],
  ['via', 'r', '路'],
  ['vey', 'r', '路，运送'],
  ['vict', 'r', '征服'],
  ['vinc', 'r', '征服'],
  ['vid', 'r', '看'],
  ['vis', 'r', '看'],
  ['view', 'r', '看'],
  ['vig', 'r', '活力'],
  ['viv', 'r', '活'],
  ['vit', 'r', '生命'],
  ['voc', 'r', '叫喊，声音'],
  ['vok', 'r', '叫喊'],
  ['voke', 'r', '叫喊'],
  ['volv', 'r', '转，滚'],
  ['volu', 'r', '转，滚'],
  ['volunt', 'r', '意愿'],
  ['vor', 'r', '吃'],
  ['vot', 'r', '发誓'],
  ['vulg', 'r', '大众'],
  ['zo', 'r', '动物'],

  // ---------- 后缀 ----------
  ['ability', 's', '可…性（名词）'],
  ['able', 's', '能够…的，可…的'],
  ['ably', 's', '可…地（副词）'],
  ['age', 's', '集合；行为结果（名词）'],
  ['al', 's', '…的；行为（形容词/名词）'],
  ['ance', 's', '性质、状态（名词）'],
  ['ancy', 's', '性质、状态（名词）'],
  ['ant', 's', '…的人/物；…的'],
  ['ar', 's', '…的；…的人'],
  ['ary', 's', '与…有关的；场所'],
  ['ate', 's', '使…；具有…的（动词/形容词）'],
  ['ation', 's', '动作、过程、结果（名词）'],
  ['ative', 's', '有…倾向的（形容词）'],
  ['cy', 's', '性质、状态（名词）'],
  ['dom', 's', '领域、状态（名词）'],
  ['ed', 's', '已…的；过去式'],
  ['ee', 's', '被…的人（名词）'],
  ['eer', 's', '从事…的人'],
  ['ence', 's', '性质、状态（名词）'],
  ['ency', 's', '性质、状态（名词）'],
  ['ent', 's', '…的；…的人/物'],
  ['er', 's', '做…的人/物；更…'],
  ['ery', 's', '行为、场所（名词）'],
  ['ese', 's', '…国的；…语'],
  ['esque', 's', '…风格的'],
  ['ess', 's', '女性（名词）'],
  ['est', 's', '最…'],
  ['etic', 's', '…的（形容词）'],
  ['ette', 's', '小；仿制品'],
  ['ful', 's', '充满…的；…的量'],
  ['fully', 's', '充满…地'],
  ['fy', 's', '使…化（动词）'],
  ['hood', 's', '状态、时期（名词）'],
  ['ial', 's', '具有…性质的'],
  ['ian', 's', '…的人；…的'],
  ['ibility', 's', '可…性（名词）'],
  ['ible', 's', '可…的'],
  ['ibly', 's', '可…地'],
  ['ic', 's', '…的；…学'],
  ['ical', 's', '…的'],
  ['ice', 's', '行为、状态（名词）'],
  ['ics', 's', '…学'],
  ['ify', 's', '使…化（动词）'],
  ['ine', 's', '…的；…素'],
  ['ing', 's', '正在…；结果物'],
  ['ion', 's', '动作、状态、结果（名词）'],
  ['ious', 's', '具有…性质的'],
  ['ise', 's', '使…化（动词）'],
  ['ish', 's', '有点…的；…民族的'],
  ['ism', 's', '主义、学说、行为'],
  ['ist', 's', '…主义者；从事…的人'],
  ['ite', 's', '…的；…的居民'],
  ['ition', 's', '动作、状态（名词）'],
  ['itive', 's', '有…倾向的'],
  ['ity', 's', '性质、状态（名词）'],
  ['ive', 's', '有…倾向的；…的人'],
  ['ize', 's', '使…化（动词）'],
  ['less', 's', '无…的，不…的'],
  ['let', 's', '小'],
  ['like', 's', '像…的'],
  ['ling', 's', '小'],
  ['logy', 's', '…学'],
  ['logist', 's', '…学家'],
  ['ly', 's', '以…方式（副词）；有…性质的'],
  ['ment', 's', '行为、状态、结果（名词）'],
  ['ness', 's', '性质、状态（名词）'],
  ['ocracy', 's', '…统治'],
  ['or', 's', '做…的人/物'],
  ['ory', 's', '与…有关的；场所'],
  ['ous', 's', '充满…的，具有…的'],
  ['phobia', 's', '恐惧症'],
  ['proof', 's', '防…的'],
  ['ship', 's', '状态、身份、技艺（名词）'],
  ['sion', 's', '动作、状态（名词）'],
  ['some', 's', '具有…倾向的'],
  ['tion', 's', '动作、状态、结果（名词）'],
  ['tude', 's', '性质、状态（名词）'],
  ['ure', 's', '行为、结果（名词）'],
  ['ward', 's', '朝…方向'],
  ['ware', 's', '…的制品/意识'],
  ['wise', 's', '在…方面；像…一样'],
  ['y', 's', '有…特征的；状态（形容词/名词）']
];

// 转成对象并按长度降序，便于"长片段优先"匹配
const ROOT_ENTRIES = RAW_ROOTS
  .map(r => ({ f: r[0], t: r[1], m: r[2] }))
  .sort((a, b) => b.f.length - a.f.length);

const ROOT_BY_FORM = {};
ROOT_ENTRIES.forEach(e => { if (!ROOT_BY_FORM[e.f]) ROOT_BY_FORM[e.f] = e; });

/**
 * 把单词拆成词根片段
 * @param {string} word 小写单词
 * @returns {{parts:Array<{text:string,type:string,meaning:string,known:boolean}>, knownCount:number}}
 */
function splitWord(word) {
  const w = String(word || '').toLowerCase().replace(/[^a-z-]/g, '');
  if (!w) return { parts: [], knownCount: 0 };

  const picked = [];
  const used = new Array(w.length).fill(false);

  const overlaps = (s, e) => {
    for (let i = s; i < e; i++) if (used[i]) return true;
    return false;
  };
  const take = (s, e) => { for (let i = s; i < e; i++) used[i] = true; };

  const tryAdd = (entry, start) => {
    const end = start + entry.f.length;
    // 前缀/后缀/词根都要求：不能吃掉整个词（除非词本身就等于该片段）
    if (end - start === w.length && w.length > entry.f.length) return false;
    if (overlaps(start, end)) return false;
    // 片段太短又不是典型前后缀时容易误伤（如 "a" 在 "cat" 里）
    if (entry.f.length < 3 && entry.t === 'r' && start !== 0) return false;
    take(start, end);
    picked.push({ start, end, text: entry.f, type: entry.t, meaning: entry.m });
    return true;
  };

  // 1) 前缀：必须开头，且剩下至少 2 个字母
  //    注意：短前缀（如 de-）容易抢走更长的词根（democracy 的 dem=人民），
  //    所以短前缀命中时先看看有没有"以它开头、更长且能匹配词首"的词根，有则优先用词根。
  for (const e of ROOT_ENTRIES) {
    if (e.t !== 'p') continue;
    if (w.startsWith(e.f) && w.length - e.f.length >= 2) {
      let better = null;
      if (e.f.length <= 3) {
        for (const r of ROOT_ENTRIES) {
          if (r.t !== 'r' || r.f.length <= e.f.length) continue;
          if (w.startsWith(r.f) && w.length - r.f.length >= 2) { better = r; break; }
        }
      }
      tryAdd(better || e, 0);
      break;
    }
  }
  // 2) 后缀：必须结尾，且前面至少剩 2 个字母
  for (const e of ROOT_ENTRIES) {
    if (e.t !== 's') continue;
    if (w.endsWith(e.f) && w.length - e.f.length >= 2) {
      tryAdd(e, w.length - e.f.length);
      break;
    }
  }
  // 3) 词根：任意位置，长片段优先
  for (const e of ROOT_ENTRIES) {
    if (e.t !== 'r') continue;
    if (e.f.length < 3) continue;
    let from = 0;
    while (true) {
      const idx = w.indexOf(e.f, from);
      if (idx < 0) break;
      tryAdd(e, idx);
      from = idx + 1;
    }
  }

  picked.sort((a, b) => a.start - b.start);

  // 4) 补空隙：未被覆盖的字母段标为 link（连接/词干）
  const parts = [];
  let cursor = 0;
  picked.forEach(p => {
    if (p.start > cursor) parts.push({ text: w.slice(cursor, p.start), type: 'link', meaning: '', known: false });
    parts.push({ text: p.text, type: p.type, meaning: p.meaning, known: true });
    cursor = p.end;
  });
  if (cursor < w.length) parts.push({ text: w.slice(cursor), type: 'link', meaning: '', known: false });

  const knownCount = parts.filter(p => p.known).length;
  return { parts, knownCount };
}

/**
 * 生成一句"由词根推导词义"的提示文本（离线版）
 */
function rootsText(word) {
  const { parts, knownCount } = splitWord(word);
  if (!knownCount) return '';
  const seg = parts.map(p => (p.meaning ? `${p.text}(${p.type === 'p' ? '前缀·' : p.type === 's' ? '后缀·' : ''}${p.meaning})` : p.text)).join(' + ');
  return seg;
}

/** 找出词库中与该词根同源的单词（用于词根本页面） */
function findCognates(words, form, limit) {
  const out = [];
  const f = String(form || '').toLowerCase();
  if (!f) return out;
  for (const w of words) {
    if (out.length >= (limit || 12)) break;
    if (w.w && w.w.includes(f)) out.push(w);
  }
  return out;
}

// ==================== 片段档案（AI 查过的就存下来，下次不用再问） ====================
// 数据源：服务端 assets/roots_library.json（key 形如 "piece:nci"），跨浏览器/跨设备有效
const PIECE_ARCHIVE = {};   // 片段 -> { piece, isRoot, meaning, note, examples }

const PieceArchive = {
  // 启动时把服务端缓存灌进来
  load(cache) {
    Object.keys(cache || {}).forEach(k => {
      if (k.indexOf('piece:') !== 0) return;
      const v = cache[k];
      if (v && v.meaning) PIECE_ARCHIVE[k.slice(6)] = v;
    });
    return this.count();
  },
  get(piece) { return PIECE_ARCHIVE[String(piece || '').toLowerCase()] || null; },
  has(piece) { return !!this.get(piece); },
  put(entry) {
    if (!entry || !entry.piece) return;
    PIECE_ARCHIVE[String(entry.piece).toLowerCase()] = entry;
  },
  all() {
    return Object.keys(PIECE_ARCHIVE).sort().map(k => PIECE_ARCHIVE[k]);
  },
  count() { return Object.keys(PIECE_ARCHIVE).length; },
  // 模糊搜索（片段 / 含义）
  search(q) {
    const s = String(q || '').toLowerCase().trim();
    if (!s) return this.all();
    return this.all().filter(e => (e.piece || '').includes(s) || (e.meaning || '').toLowerCase().includes(s));
  }
};

// ==================== 讲解档案（AI 讲解过的词，打开卡片直接读，不再重复花钱） ====================
const EXPLAIN_ARCHIVE = {};
const ExplainArchive = {
  load(cache) {
    Object.keys(cache || {}).forEach(k => {
      if (k.indexOf('explain:') !== 0) return;
      const v = cache[k];
      if (v && (v.memory || v.usage || v.confusable)) EXPLAIN_ARCHIVE[k.slice(8)] = v;
    });
    return this.count();
  },
  get(word) { return EXPLAIN_ARCHIVE[String(word || '').toLowerCase()] || null; },
  put(word, d) { if (word && d) EXPLAIN_ARCHIVE[String(word).toLowerCase()] = d; },
  count() { return Object.keys(EXPLAIN_ARCHIVE).length; }
};

// ==================== 拆解档案（AI 拆过的单词，跟着单词保存，可导出分享） ====================
// 数据源：服务端 roots_library.json（key 形如 "roots:economic"）
// 额外作用：AI 拆出来的、本地词根库没有的词根会被动态登记进 ROOT_BY_FORM，
//           以后别的单词里再出现同一个词根就能直接认出来（不用再问 AI）
const EXPLODE_ARCHIVE = {};   // 单词 -> { parts, core, story, cognates }
const DYNAMIC_ROOTS = {};     // 从 AI 拆解里学到的词根：form -> { f, t, m, ai:true }
const AI_ROOT_NOTES = {};     // 词根 -> AI 在不同单词里看到的含义 [{ m, w }]

function registerDynamicRoot(form, type, meaning, word) {
  const f = String(form || '').toLowerCase().replace(/[^a-z-]/g, '');
  const m = String(meaning || '').trim();
  if (f.length < 2 || !m) return;

  // 同一个字母组合可能来自不同词源、在不同单词里含义不同 —— 全部留痕，详情页会列出来
  if (!AI_ROOT_NOTES[f]) AI_ROOT_NOTES[f] = [];
  if (!AI_ROOT_NOTES[f].some(x => x.m === m)) AI_ROOT_NOTES[f].push({ m: m, w: String(word || '') });

  if (ROOT_BY_FORM[f]) return;                                       // 本地库已有 → 不覆盖它的含义
  const t = (type === 'p' || type === 'prefix') ? 'p' : (type === 's' || type === 'suffix') ? 's' : 'r';
  const e = { f, t, m: m, ai: true };
  ROOT_BY_FORM[f] = e;
  DYNAMIC_ROOTS[f] = e;
  ROOT_ENTRIES.push(e);
  ROOT_ENTRIES.sort((a, b) => b.f.length - a.f.length);               // 保持「长片段优先」
}

function clearDynamicRoots() {
  Object.keys(DYNAMIC_ROOTS).forEach(f => {
    const e = DYNAMIC_ROOTS[f];
    const i = ROOT_ENTRIES.indexOf(e);
    if (i >= 0) ROOT_ENTRIES.splice(i, 1);
    if (ROOT_BY_FORM[f] === e) delete ROOT_BY_FORM[f];
    delete DYNAMIC_ROOTS[f];
  });
  Object.keys(AI_ROOT_NOTES).forEach(f => delete AI_ROOT_NOTES[f]);
}

const ExplodeArchive = {
  // 启动 / 导入时灌入服务端资料
  load(cache) {
    Object.keys(cache || {}).forEach(k => {
      if (k.indexOf('roots:') !== 0) return;
      const v = cache[k];
      if (v && Array.isArray(v.parts) && v.parts.length) EXPLODE_ARCHIVE[k.slice(6)] = v;
    });
    // 动态词根全量重建（删掉某条拆解后不留残渣）
    clearDynamicRoots();
    Object.keys(EXPLODE_ARCHIVE).forEach(w => {
      (EXPLODE_ARCHIVE[w].parts || []).forEach(p => registerDynamicRoot(p.text, p.type, p.meaning, w));
    });
    return this.count();
  },
  get(word) { return EXPLODE_ARCHIVE[String(word || '').toLowerCase()] || null; },
  has(word) { return !!this.get(word); },
  put(word, data) {
    const w = String(word || '').toLowerCase();
    if (!w || !data) return;
    EXPLODE_ARCHIVE[w] = data;
    (data.parts || []).forEach(p => registerDynamicRoot(p.text, p.type, p.meaning, w));
  },
  all() {
    return Object.keys(EXPLODE_ARCHIVE).sort().map(w => Object.assign({ word: w }, EXPLODE_ARCHIVE[w]));
  },
  count() { return Object.keys(EXPLODE_ARCHIVE).length; },
  dynamicRoots() { return Object.keys(DYNAMIC_ROOTS).map(f => DYNAMIC_ROOTS[f]); },
  // 某个词根：AI 在不同单词里看到的含义（用于呈现「同一个片段、不同含义」的情况）
  aiRootNotes(form) { return AI_ROOT_NOTES[String(form || '').toLowerCase()] || []; }
};

// ==================== 提示档案（每个词的两级提示，跟随单词、可导出分享） ====================
const HINT_ARCHIVE = {};
const HintArchive = {
  load(cache) {
    Object.keys(cache || {}).forEach(k => {
      if (k.indexOf('hint:') !== 0) return;
      const v = cache[k];
      if (v && Array.isArray(v.hints) && v.hints.some(Boolean)) HINT_ARCHIVE[k.slice(5)] = v;
    });
    return this.count();
  },
  get(word) { return HINT_ARCHIVE[String(word || '').toLowerCase()] || null; },
  put(word, hints) { if (word && Array.isArray(hints)) HINT_ARCHIVE[String(word).toLowerCase()] = { hints }; },
  count() { return Object.keys(HINT_ARCHIVE).length; }
};

if (typeof window !== 'undefined') {
  window.Roots = {
    ROOT_ENTRIES, ROOT_BY_FORM, splitWord, rootsText, findCognates, PieceArchive, ExplainArchive, HintArchive, ExplodeArchive
  };
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ROOT_ENTRIES, ROOT_BY_FORM, splitWord, rootsText, findCognates, PieceArchive, ExplainArchive, HintArchive, ExplodeArchive };
}
