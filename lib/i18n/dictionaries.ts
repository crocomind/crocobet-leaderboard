import type { Locale } from "./config";

/**
 * All UI strings. `en` is the source of truth; `ka` must have the same shape
 * (TypeScript enforces it). Placeholders look like {name}. Objects with
 * `one`/`other` are plural forms, chosen with Intl.PluralRules.
 *
 * Brand names (Instagram, TikTok, ...) and the app name are not translated.
 */
const en = {
  app: {
    name: "Croco Creators",
    description: "The content creators leaderboard for the Crocobet team.",
    skipToContent: "Skip to content",
  },
  nav: {
    label: "Sections",
    leaderboard: "Leaderboard",
    myPosts: "My Posts",
  },
  header: {
    submitPost: "Submit post",
    accountMenu: "Open account menu",
    switchToLight: "Switch to light theme",
    switchToDark: "Switch to dark theme",
    theme: "Theme",
    themeDark: "Dark",
    themeLight: "Light",
    language: "Language",
    signOut: "Sign out",
    signingOut: "Signing out…",
    profileError: "Couldn't load your profile.",
    profileLoading: "Loading your profile…",
  },
  common: {
    retry: "Try again",
    close: "Close",
    you: "You",
    new: "New",
    justNow: "just now",
    untitled: "Untitled post",
    openPost: "Open post",
    opensInNewTab: "opens in a new tab",
    posts: { one: "{count} post", other: "{count} posts" },
  },
  metrics: {
    views: "Views",
    reactions: "Reactions",
    score: "Combined score",
    scoreShort: "Score",
    units: {
      views: { one: "{count} view", other: "{count} views" },
      reactions: { one: "{count} reaction", other: "{count} reactions" },
      score: { one: "{count} point", other: "{count} points" },
    },
  },
  periods: {
    week: "This week",
    month: "This month",
    all: "All time",
  },
  leaderboard: {
    title: "Leaderboard",
    subtitle: "Share posts, collect views and reactions, and climb the ranks.",
    lastUpdated: "Last updated {time}",
    updating: "Updating…",
    metricLabel: "Rank by",
    platformLabel: "Platform",
    periodLabel: "Period",
    allPlatforms: "All",
    allPlatformsLong: "All platforms",
    searchLabel: "Search employees by name",
    searchPlaceholder: "Search by name",
    clearSearch: "Clear search",
    podiumLabel: "Top three",
    listLabel: "Rankings",
    columns: {
      rank: "Rank",
      employee: "Employee",
      posts: "Posts",
      views: "Views",
      reactions: "Reactions",
      score: "Score",
      change: "Change",
    },
    rankChange: {
      up: { one: "Up {count} place", other: "Up {count} places" },
      down: { one: "Down {count} place", other: "Down {count} places" },
      same: "No change",
      new: "New on the board",
    },
    standing: {
      label: "Your position",
      rank: "You're #{rank}",
      behind: "{gap} behind #{nextRank}",
      tied: "Tied with #{nextRank}",
      leading: "You're in the lead. Keep it up!",
      notRanked: "You're not on the board yet",
      notRankedHint: "Submit a post to join in.",
      show: "Show my position",
    },
    empty: {
      title: "No posts here yet",
      description:
        "Nobody has posted for this platform and period yet. Be the first!",
      searchTitle: "No one matches “{query}”",
      searchDescription: "Check the spelling or try another name.",
    },
    error: {
      title: "Couldn't load the leaderboard",
      description: "Check your connection and try again.",
    },
    announce: "Ranked by {metric}, {period}. {count} participants.",
    announceStanding: "You're ranked {rank}.",
    rowLabel: "Rank {rank}: {name}, {department}. {stats}. {change}.",
  },
  employee: {
    postsTitle: "Posts",
    counting: "Counting {platform} · {period}",
    empty: "No posts for this platform and period.",
    error: "Couldn't load these posts.",
    rank: "Rank #{rank}",
  },
  myPosts: {
    title: "My Posts",
    subtitle: "Your submissions and how they're doing.",
    summary: {
      views: "Total views",
      reactions: "Total reactions",
      rank: "Current rank",
      posts: "Posts",
      rankOf: "of {total}",
      notRanked: "Not ranked yet",
      rankHint: "All time, combined score",
      postsHint: "{count} verified",
    },
    status: {
      pending: "Pending verification",
      verified: "Verified",
      rejected: "Rejected",
    },
    rejectionReason: "Reason: {reason}",
    statsPending: "Stats show up once it's verified.",
    posted: "Posted {date}",
    submitted: "Submitted {date}",
    listLabel: "Your posts",
    empty: {
      title: "No posts yet",
      description: "Share your first post and start climbing the leaderboard.",
      cta: "Submit your first post",
    },
    error: {
      title: "Couldn't load your posts",
      description: "Check your connection and try again.",
    },
  },
  submit: {
    title: "Submit a post",
    description: "Paste the link to your post on {platforms}.",
    urlLabel: "Post link",
    urlPlaceholder: "Paste your post link",
    paste: "Paste",
    pasteLabel: "Paste link from clipboard",
    pasteFailed:
      "Couldn't read the clipboard. Paste with Ctrl+V (⌘V on Mac) instead.",
    detected: "{platform} link detected",
    supported: "Works with {platforms}",
    titleLabel: "Title or caption",
    titlePlaceholder: "What's your post about?",
    postedAtLabel: "Posted on",
    optional: "Optional",
    characterCount: "{count}/{max}",
    previewLabel: "Preview",
    previewTitle: "Your post title",
    submit: "Submit post",
    submitting: "Submitting…",
    successTitle: "Post submitted!",
    successDescription:
      "We'll verify it soon. Once it's approved, its views and reactions count toward your rank.",
    submitAnother: "Submit another",
    viewLeaderboard: "View on leaderboard",
    errorTitle: "Couldn't submit your post",
    errorDescription:
      "Something went wrong on our side. Your link is still here, so you can try again.",
  },
  validation: {
    required: "Paste a link to your post to continue.",
    invalidUrl: "That doesn't look like a link. Check it and try again.",
    unsupportedPlatform: "Only {platforms} links are supported for now.",
    notAPost:
      "This {platform} link doesn't point to a post. Open the post and copy its link.",
    unsupportedContent:
      "Stories, profiles, feeds and TikTok photo posts don't count. Paste the link to a single post or video.",
    duplicate: "This post has already been submitted.",
    titleTooLong: "Keep the title under {max} characters.",
    dateInvalid: "Enter a valid date.",
    dateInFuture: "The posted date can't be in the future.",
  },
  auth: {
    pageTitle: "Sign in",
    title: "Welcome to Croco Creators",
    subtitle:
      "Sign in with your Crocobet work account to see the leaderboard and submit your posts.",
    signInWithMicrosoft: "Sign in with Microsoft",
    redirecting: "Redirecting to Microsoft…",
    onlyEmployees:
      "Only Crocobet employees with a {domains} account can sign in.",
    signedOut: "You've been signed out.",
    errors: {
      domainNotAllowed:
        "That isn't a Crocobet work account. Sign in with your {domains} address.",
      wrongTenant:
        "That account belongs to another organization. Sign in with your Crocobet work account.",
      cancelled: "Sign-in was cancelled.",
      expired: "Sign-in took too long or was interrupted. Please try again.",
      notConfigured: "Sign-in isn't set up yet. Ask the app's administrators.",
      generic: "We couldn't sign you in. Please try again.",
    },
    missingConfig: "Missing environment variables: {names}",
  },
  errors: {
    pageTitle: "Something went wrong",
    pageDescription:
      "An unexpected error occurred. Try again, and if it keeps happening, let the team know.",
  },
};

type Widen<T> = { [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };
export type Dictionary = Widen<typeof en>;

const ka: Dictionary = {
  app: {
    name: "Croco Creators",
    description: "Crocobet-ის გუნდის კონტენტ-შემქმნელების რეიტინგი.",
    skipToContent: "მთავარ შინაარსზე გადასვლა",
  },
  nav: {
    label: "განყოფილებები",
    leaderboard: "რეიტინგი",
    myPosts: "ჩემი პოსტები",
  },
  header: {
    submitPost: "პოსტის დამატება",
    accountMenu: "ანგარიშის მენიუს გახსნა",
    switchToLight: "ღია თემაზე გადართვა",
    switchToDark: "მუქ თემაზე გადართვა",
    theme: "თემა",
    themeDark: "მუქი",
    themeLight: "ღია",
    language: "ენა",
    signOut: "გასვლა",
    signingOut: "გასვლა…",
    profileError: "პროფილის ჩატვირთვა ვერ მოხერხდა.",
    profileLoading: "პროფილი იტვირთება…",
  },
  common: {
    retry: "თავიდან ცდა",
    close: "დახურვა",
    you: "თქვენ",
    new: "ახალი",
    justNow: "ახლახან",
    untitled: "უსათაურო პოსტი",
    openPost: "პოსტის გახსნა",
    opensInNewTab: "იხსნება ახალ ჩანართში",
    posts: { one: "{count} პოსტი", other: "{count} პოსტი" },
  },
  metrics: {
    views: "ნახვები",
    reactions: "რეაქციები",
    score: "ჯამური ქულა",
    scoreShort: "ქულა",
    units: {
      views: { one: "{count} ნახვა", other: "{count} ნახვა" },
      reactions: { one: "{count} რეაქცია", other: "{count} რეაქცია" },
      score: { one: "{count} ქულა", other: "{count} ქულა" },
    },
  },
  periods: {
    week: "ეს კვირა",
    month: "ეს თვე",
    all: "მთელი პერიოდი",
  },
  leaderboard: {
    title: "რეიტინგი",
    subtitle:
      "გამოაქვეყნეთ პოსტები, დააგროვეთ ნახვები და რეაქციები და აიწიეთ რეიტინგში.",
    lastUpdated: "ბოლო განახლება: {time}",
    updating: "ახლდება…",
    metricLabel: "დალაგება",
    platformLabel: "პლატფორმა",
    periodLabel: "პერიოდი",
    allPlatforms: "ყველა",
    allPlatformsLong: "ყველა პლატფორმა",
    searchLabel: "თანამშრომლის ძებნა სახელით",
    searchPlaceholder: "ძებნა სახელით",
    clearSearch: "ძებნის გასუფთავება",
    podiumLabel: "საუკეთესო სამეული",
    listLabel: "რეიტინგი",
    columns: {
      rank: "ადგილი",
      employee: "თანამშრომელი",
      posts: "პოსტები",
      views: "ნახვები",
      reactions: "რეაქციები",
      score: "ქულა",
      change: "ცვლილება",
    },
    rankChange: {
      up: { one: "{count} ადგილით ზემოთ", other: "{count} ადგილით ზემოთ" },
      down: { one: "{count} ადგილით ქვემოთ", other: "{count} ადგილით ქვემოთ" },
      same: "უცვლელი",
      new: "ახალი მონაწილე",
    },
    standing: {
      label: "თქვენი პოზიცია",
      rank: "თქვენ ხართ #{rank}",
      behind: "#{nextRank}-მდე გაკლიათ {gap}",
      tied: "#{nextRank}-ის ტოლი შედეგი",
      leading: "თქვენ ლიდერობთ. ასე გააგრძელეთ!",
      notRanked: "რეიტინგში ჯერ არ ხართ",
      notRankedHint: "დაამატეთ პოსტი და შეუერთდით შეჯიბრს.",
      show: "ჩემს პოზიციაზე გადასვლა",
    },
    empty: {
      title: "აქ ჯერ პოსტები არ არის",
      description:
        "ამ პლატფორმასა და პერიოდში ჯერ არავის გამოუქვეყნებია. იყავით პირველი!",
      searchTitle: "„{query}“ ვერ მოიძებნა",
      searchDescription: "შეამოწმეთ მართლწერა ან სცადეთ სხვა სახელი.",
    },
    error: {
      title: "რეიტინგის ჩატვირთვა ვერ მოხერხდა",
      description: "შეამოწმეთ ინტერნეტთან კავშირი და სცადეთ თავიდან.",
    },
    announce: "დალაგება: {metric}, {period}. მონაწილეები: {count}.",
    announceStanding: "თქვენი ადგილია {rank}.",
    rowLabel: "ადგილი {rank}: {name}, {department}. {stats}. {change}.",
  },
  employee: {
    postsTitle: "პოსტები",
    counting: "ითვლება: {platform} · {period}",
    empty: "ამ პლატფორმასა და პერიოდში პოსტები არ არის.",
    error: "პოსტების ჩატვირთვა ვერ მოხერხდა.",
    rank: "ადგილი #{rank}",
  },
  myPosts: {
    title: "ჩემი პოსტები",
    subtitle: "თქვენი პოსტები და მათი შედეგები.",
    summary: {
      views: "ჯამური ნახვები",
      reactions: "ჯამური რეაქციები",
      rank: "მიმდინარე ადგილი",
      posts: "პოსტები",
      rankOf: "{total}-დან",
      notRanked: "ჯერ არ ხართ რეიტინგში",
      rankHint: "მთელი პერიოდი, ჯამური ქულა",
      postsHint: "დადასტურებული: {count}",
    },
    status: {
      pending: "ელოდება დადასტურებას",
      verified: "დადასტურებული",
      rejected: "უარყოფილი",
    },
    rejectionReason: "მიზეზი: {reason}",
    statsPending: "სტატისტიკა დადასტურების შემდეგ გამოჩნდება.",
    posted: "გამოქვეყნდა {date}",
    submitted: "დაემატა {date}",
    listLabel: "თქვენი პოსტები",
    empty: {
      title: "ჯერ პოსტი არ გაქვთ",
      description: "გააზიარეთ პირველი პოსტი და დაიწყეთ რეიტინგში წინსვლა.",
      cta: "პირველი პოსტის დამატება",
    },
    error: {
      title: "პოსტების ჩატვირთვა ვერ მოხერხდა",
      description: "შეამოწმეთ ინტერნეტთან კავშირი და სცადეთ თავიდან.",
    },
  },
  submit: {
    title: "პოსტის დამატება",
    description: "ჩასვით თქვენი პოსტის ბმული ({platforms}).",
    urlLabel: "პოსტის ბმული",
    urlPlaceholder: "ჩასვით პოსტის ბმული",
    paste: "ჩასმა",
    pasteLabel: "ბმულის ჩასმა ბუფერიდან",
    pasteFailed: "ბუფერზე წვდომა ვერ მოხერხდა. ჩასვით Ctrl+V-ით (Mac-ზე ⌘V).",
    detected: "ამოცნობილია {platform}-ის ბმული",
    supported: "მხარდაჭერილია: {platforms}",
    titleLabel: "სათაური ან აღწერა",
    titlePlaceholder: "რას ეხება თქვენი პოსტი?",
    postedAtLabel: "გამოქვეყნების თარიღი",
    optional: "არასავალდებულო",
    characterCount: "{count}/{max}",
    previewLabel: "გადახედვა",
    previewTitle: "თქვენი პოსტის სათაური",
    submit: "პოსტის დამატება",
    submitting: "იგზავნება…",
    successTitle: "პოსტი დაემატა!",
    successDescription:
      "მალე გადავამოწმებთ. დადასტურების შემდეგ მისი ნახვები და რეაქციები თქვენს რეიტინგში აისახება.",
    submitAnother: "კიდევ ერთის დამატება",
    viewLeaderboard: "რეიტინგის ნახვა",
    errorTitle: "პოსტის დამატება ვერ მოხერხდა",
    errorDescription:
      "ჩვენს მხარეს რაღაც შეფერხდა. ბმული შენახულია, შეგიძლიათ თავიდან სცადოთ.",
  },
  validation: {
    required: "გასაგრძელებლად ჩასვით პოსტის ბმული.",
    invalidUrl: "ეს ბმულს არ ჰგავს. შეამოწმეთ და სცადეთ თავიდან.",
    unsupportedPlatform:
      "ამჟამად მხარდაჭერილია მხოლოდ ეს პლატფორმები: {platforms}.",
    notAPost:
      "ეს {platform}-ის ბმული პოსტს არ უთითებს. გახსენით პოსტი და დააკოპირეთ მისი ბმული.",
    unsupportedContent:
      "სთორები, პროფილები, ფიდები და TikTok-ის ფოტო-პოსტები არ ითვლება. ჩასვით კონკრეტული პოსტის ან ვიდეოს ბმული.",
    duplicate: "ეს პოსტი უკვე დამატებულია.",
    titleTooLong: "სათაური არ უნდა აღემატებოდეს {max} სიმბოლოს.",
    dateInvalid: "შეიყვანეთ სწორი თარიღი.",
    dateInFuture: "გამოქვეყნების თარიღი მომავალში ვერ იქნება.",
  },
  auth: {
    pageTitle: "შესვლა",
    title: "კეთილი იყოს თქვენი მობრძანება Croco Creators-ში",
    subtitle:
      "შედით Crocobet-ის სამსახურებრივი ანგარიშით, რომ ნახოთ რეიტინგი და დაამატოთ თქვენი პოსტები.",
    signInWithMicrosoft: "შესვლა Microsoft-ით",
    redirecting: "გადამისამართება Microsoft-ზე…",
    onlyEmployees:
      "შესვლა შეუძლიათ მხოლოდ Crocobet-ის თანამშრომლებს ({domains} ანგარიშით).",
    signedOut: "თქვენ გამოხვედით სისტემიდან.",
    errors: {
      domainNotAllowed:
        "ეს არ არის Crocobet-ის სამსახურებრივი ანგარიში. შედით {domains} მისამართით.",
      wrongTenant:
        "ეს ანგარიში სხვა ორგანიზაციას ეკუთვნის. შედით Crocobet-ის სამსახურებრივი ანგარიშით.",
      cancelled: "შესვლა გაუქმდა.",
      expired: "შესვლას ძალიან დიდი დრო დასჭირდა ან შეწყდა. სცადეთ თავიდან.",
      notConfigured:
        "შესვლა ჯერ არ არის გამართული. მიმართეთ აპლიკაციის ადმინისტრატორებს.",
      generic: "შესვლა ვერ მოხერხდა. სცადეთ თავიდან.",
    },
    missingConfig: "აკლია გარემოს ცვლადები: {names}",
  },
  errors: {
    pageTitle: "რაღაც შეფერხდა",
    pageDescription:
      "მოულოდნელი შეცდომა მოხდა. სცადეთ თავიდან, და თუ პრობლემა განმეორდება, შეატყობინეთ გუნდს.",
  },
};

export const dictionaries: Record<Locale, Dictionary> = { en, ka };
