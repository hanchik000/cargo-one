// Lucide icon set (via react-icons/lu). One import point keeps iconography consistent.
export {
  LuHouse as IconHome, LuStore as IconShop, LuTruck as IconCargo, LuCar as IconAuto, LuUser as IconProfile, LuBriefcase as IconBusiness,
  LuLayoutDashboard as IconAdmin, LuSearch as IconSearch, LuScanLine as IconScan, LuLink as IconLink, LuBot as IconAI, LuWallet as IconWallet,
  LuPackageSearch as IconTrack, LuBell as IconBell, LuHeart as IconHeart, LuShoppingCart as IconCart, LuMapPin as IconPin, LuX as IconX,
  LuPlus as IconPlus, LuMinus as IconMinus, LuCheck as IconCheck, LuUpload as IconUpload, LuFileText as IconFile, LuStar as IconStar,
  LuTrendingDown as IconDrop, LuTimer as IconTimer, LuSlidersHorizontal as IconFilter, LuArrowUpDown as IconSort, LuCrown as IconCrown,
  LuTicket as IconTicket, LuLifeBuoy as IconSupport, LuMessageSquare as IconChat, LuLanguages as IconLang, LuLogOut as IconLogout,
  LuLock as IconLock, LuSmartphone as IconPhone, LuMail as IconMail, LuCircleAlert as IconAlert, LuCircleCheck as IconOk, LuRefreshCw as IconRetry,
  LuEye as IconEye, LuTrash2 as IconTrash, LuPencil as IconEdit, LuCopy as IconCopy, LuLayers as IconLayers, LuGauge as IconGauge,
  LuBatteryCharging as IconBattery, LuZap as IconZap, LuFuel as IconFuel, LuClipboardCheck as IconInspect, LuReceipt as IconReceipt,
  LuBanknote as IconMoney, LuBuilding2 as IconBuilding, LuCalendar as IconCalendar, LuClock as IconClock, LuPackageCheck as IconPackageOk,
  LuPackageOpen as IconPackage, LuContainer as IconContainer, LuMenu as IconMenu, LuScale as IconScale, LuGitCompare as IconCompare,
  LuBookmark as IconBookmark, LuHistory as IconHistory, LuSend as IconSend, LuPaperclip as IconClip, LuExternalLink as IconExternal,
  LuInfo as IconInfo, LuTriangleAlert as IconWarn, LuBan as IconBan, LuLoaderCircle as IconSpinner, LuInbox as IconInbox,
  LuChartColumn as IconChart, LuShieldCheck as IconShield, LuBadgeCheck as IconVerified, LuArrowRight as IconArrow, LuChevronRight as IconChevron,
  LuChevronLeft as IconBack, LuChevronDown as IconDown, LuCommand as IconCommand, LuMic as IconMic, LuVideo as IconVideo, LuImage as IconImage,
  LuGlobe as IconGlobe, LuSettings as IconSettings, LuUsers as IconUsers, LuMegaphone as IconMegaphone, LuScrollText as IconScroll,
  LuWarehouse as IconWarehouse, LuTrainFront as IconTrain, LuPlane as IconPlane, LuCreditCard as IconCard, LuGift as IconGift, LuPercent as IconPercent,
  LuFactory as IconFactory, LuTag as IconTag, LuHash as IconHash, LuSparkles as IconSparkles, LuArrowLeftRight as IconSwap, LuCircleDot as IconDot, LuSun as IconSun, LuMoon as IconMoon,
  LuCamera as IconCamera, LuSwitchCamera as IconFlipCamera, LuScanFace as IconScanFace, LuRotateCcw as IconRotateL, LuRotateCw as IconRotateR,
  LuZoomIn as IconZoomIn, LuZoomOut as IconZoomOut, LuShare2 as IconShare, LuDownload as IconDownload, LuPersonStanding as IconPerson, LuMove as IconMove,
} from 'react-icons/lu';

import {
  LuSmartphone, LuShirt, LuSofa, LuSparkles, LuBaby, LuCar, LuWrench, LuFactory, LuBriefcase, LuHeadphones, LuWatch, LuPlug, LuSpeaker, LuKeyboard,
  LuCamera, LuShoppingBag, LuFootprints, LuGlasses, LuCookingPot, LuLamp, LuArmchair, LuBedDouble, LuBoxes, LuDroplet, LuGift, LuBlocks, LuBike,
  LuPuzzle, LuBatteryCharging, LuGauge, LuDrill, LuRuler, LuWarehouse, LuCog, LuLightbulb, LuPackage, LuPrinter,
} from 'react-icons/lu';
import type { IconType } from 'react-icons';

export const NAMED_ICONS: Record<string, IconType> = {
  Smartphone: LuSmartphone, Shirt: LuShirt, Sofa: LuSofa, Sparkles: LuSparkles, Baby: LuBaby, Car: LuCar, Wrench: LuWrench, Factory: LuFactory,
  Briefcase: LuBriefcase, Headphones: LuHeadphones, Watch: LuWatch, Plug: LuPlug, Speaker: LuSpeaker, Keyboard: LuKeyboard, Camera: LuCamera,
  ShoppingBag: LuShoppingBag, Footprints: LuFootprints, Glasses: LuGlasses, CookingPot: LuCookingPot, Lamp: LuLamp, Armchair: LuArmchair,
  BedDouble: LuBedDouble, Boxes: LuBoxes, Droplet: LuDroplet, Gift: LuGift, Blocks: LuBlocks, Bike: LuBike, Puzzle: LuPuzzle,
  BatteryCharging: LuBatteryCharging, Gauge: LuGauge, Drill: LuDrill, Ruler: LuRuler, Warehouse: LuWarehouse, Cog: LuCog, Lightbulb: LuLightbulb,
  Package: LuPackage, Printer: LuPrinter,
};
export const namedIcon = (name: string): IconType => NAMED_ICONS[name] || LuPackage;
