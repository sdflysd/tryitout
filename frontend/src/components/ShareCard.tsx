import React, { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { CheckCircle, LoaderCircle, Share2, Sparkles, X } from "lucide-react";
import { Simulation } from "../types";
import { postValidationEvent } from "../validation-events";
import {
  buildShareCardText,
  copyShareTextToClipboard,
  createBrowserShareEnvironment,
  getAgentObjection,
  getDisplayName,
  getRecommendedRoute,
  getShareCardCopy,
  getSimulationType,
  renderSharePosterBlob,
  sharePosterImageWithFallback,
  shouldPreferNativeFileShare,
  type SharePosterOutcome,
} from "./share-card-sharing";

interface ShareCardProps {
  simulation: Simulation;
  onClose: () => void;
}

type ShareTheme = "space_grey" | "gold" | "cyber_purple";
type ShareStatus = "idle" | "preparing" | SharePosterOutcome | "text-fallback" | "text-unavailable";

function getInitialNativeSharePreference(): boolean {
  return typeof window === "undefined" ? true : shouldPreferNativeFileShare(window.navigator);
}

function getShareStatusLabel(status: ShareStatus, preferNativeShare: boolean): string {
  switch (status) {
    case "preparing":
      return "正在生成图片...";
    case "native-share":
      return "请选择微信发送";
    case "native-share-cancelled":
      return "分享已取消";
    case "image-clipboard":
      return "图片已复制，去微信粘贴";
    case "downloaded-text":
      return "图片已下载，文字已复制";
    case "downloaded":
      return "图片已下载，去微信发送";
    case "text-fallback":
      return "已复制文字，去微信粘贴";
    case "text-unavailable":
      return "复制失败，请手动复制";
    case "idle":
    default:
      return preferNativeShare ? "一键分享到微信" : "复制图片发微信";
  }
}

export default function ShareCard({ simulation, onClose }: ShareCardProps) {
  const [selectedTheme, setSelectedTheme] = useState<ShareTheme>("gold");
  const [shareStatus, setShareStatus] = useState<ShareStatus>("idle");
  const [preferNativeShare, setPreferNativeShare] = useState(getInitialNativeSharePreference);
  const [posterImage, setPosterImage] = useState<Blob | null>(null);
  const [posterImageFailed, setPosterImageFailed] = useState(false);
  const posterRef = useRef<HTMLDivElement>(null);
  const { report } = simulation;
  const copy = getShareCardCopy(getSimulationType(simulation));
  const displayName = getDisplayName(simulation, copy.fallbackName);
  const recommendedRoute = getRecommendedRoute(simulation);
  const agentObjection = getAgentObjection(simulation);
  const shareText = buildShareCardText(simulation);
  const isPosterPreparing = !posterImage && !posterImageFailed;
  const isShareButtonDisabled = shareStatus === "preparing" || isPosterPreparing;

  useEffect(() => {
    setPreferNativeShare(shouldPreferNativeFileShare(window.navigator));
  }, []);

  useEffect(() => {
    let isCancelled = false;
    setPosterImage(null);
    setPosterImageFailed(false);

    const renderPoster = async () => {
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve());
      });

      const posterElement = posterRef.current;
      if (!posterElement) {
        if (!isCancelled) {
          setPosterImageFailed(true);
        }
        return;
      }

      try {
        const image = await renderSharePosterBlob(posterElement);
        if (!isCancelled) {
          setPosterImage(image);
        }
      } catch {
        if (!isCancelled) {
          setPosterImageFailed(true);
        }
      }
    };

    void renderPoster();

    return () => {
      isCancelled = true;
    };
  }, [selectedTheme, simulation]);

  const setTemporaryShareStatus = (status: ShareStatus) => {
    setShareStatus(status);

    if (status !== "text-unavailable") {
      window.setTimeout(() => setShareStatus("idle"), 3000);
    }
  };

  const handleThemeSelect = (theme: ShareTheme) => {
    setPosterImage(null);
    setPosterImageFailed(false);
    setSelectedTheme(theme);
  };

  const handleShareToWechat = async () => {
    if (isShareButtonDisabled) {
      return;
    }

    void postValidationEvent({
      type: "share_clicked",
      simulationId: simulation.id,
      scenarioType: getSimulationType(simulation),
    });

    setShareStatus("preparing");

    try {
      if (!posterImage) {
        const copied = await copyShareTextToClipboard(shareText, createBrowserShareEnvironment());
        setTemporaryShareStatus(copied ? "text-fallback" : "text-unavailable");
        return;
      }

      const outcome = await sharePosterImageWithFallback(
        {
          image: posterImage,
          fileName: `tryitout-share-${simulation.id.slice(0, 8)}.png`,
          title: copy.modalTitle,
          text: shareText,
          preferNativeShare,
        },
        createBrowserShareEnvironment(),
      );
      setTemporaryShareStatus(outcome);
    } catch {
      const copied = await copyShareTextToClipboard(shareText, createBrowserShareEnvironment());
      setTemporaryShareStatus(copied ? "text-fallback" : "text-unavailable");
    }
  };

  const getThemeStyles = (theme: ShareTheme) => {
    switch (theme) {
      case "space_grey":
        return {
          bg: "bg-[#18181b] text-zinc-100",
          cardBg: "bg-zinc-900 border-zinc-800",
          accentText: "text-zinc-400",
          divider: "border-zinc-800",
          badge: "bg-zinc-800 text-zinc-300 border-zinc-700",
          highlight: "text-amber-400",
          btnColor: "bg-zinc-800 hover:bg-zinc-700 text-zinc-100"
        };
      case "cyber_purple":
        return {
          bg: "bg-[#0b0314] text-purple-100",
          cardBg: "bg-purple-950/40 border-purple-900/60",
          accentText: "text-purple-300",
          divider: "border-purple-900/60",
          badge: "bg-purple-900/50 text-purple-200 border-purple-800",
          highlight: "text-fuchsia-400",
          btnColor: "bg-purple-900 hover:bg-purple-800 text-purple-100"
        };
      case "gold":
      default:
        return {
          bg: "bg-amber-950 text-amber-50",
          cardBg: "bg-amber-900/40 border-amber-800/60",
          accentText: "text-amber-300/80",
          divider: "border-amber-800/60",
          badge: "bg-amber-900/60 text-amber-100 border-amber-700/60",
          highlight: "text-yellow-400",
          btnColor: "bg-amber-500 hover:bg-amber-600 text-gray-950 font-bold"
        };
    }
  };

  const st = getThemeStyles(selectedTheme);

  return (
    <div id="share-card-modal" className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50 overflow-y-auto backdrop-blur-xs">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-3xl p-5 md:p-6 max-w-sm w-full shadow-2xl relative text-center space-y-5"
      >
        {/* Modal Close Button */}
        <button
          id="btn-close-share"
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-full transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="text-left space-y-1">
          <h2 id="share-modal-title" className="text-sm font-black text-gray-950 flex items-center gap-1.5">
            <Sparkles className="w-4.5 h-4.5 text-amber-500" />
            <span>{copy.modalTitle}</span>
          </h2>
          <p className="text-3xs text-gray-400">{copy.modalDescription}</p>
        </div>

        {/* Theme Swapping Selectors */}
        <div className="flex gap-2 justify-center">
          {[
            { id: "gold", label: "鎏金黄" },
            { id: "space_grey", label: "极客灰" },
            { id: "cyber_purple", label: "霓虹紫" }
          ].map((theme) => (
            <button
              key={theme.id}
              onClick={() => handleThemeSelect(theme.id as ShareTheme)}
              className={`text-2xs px-3 py-1.5 rounded-lg border font-bold transition-all cursor-pointer ${
                selectedTheme === theme.id
                  ? "bg-amber-500 border-amber-500 text-gray-950 shadow-xs scale-98"
                  : "bg-gray-50 hover:bg-gray-100 border-gray-200 text-gray-600"
              }`}
            >
              {theme.label}
            </button>
          ))}
        </div>

        {/* Visual Poster Card Container */}
        <div 
          ref={posterRef}
          id="share-poster-card" 
          className={`rounded-2xl p-5 border text-left shadow-lg relative overflow-hidden transition-all duration-300 font-sans ${st.bg} ${st.cardBg}`}
        >
          {/* Subtle decor circles */}
          <div className="absolute -top-12 -right-12 w-28 h-28 bg-white/5 rounded-full blur-xl pointer-events-none" />
          <div className="absolute -bottom-12 -left-12 w-28 h-28 bg-white/5 rounded-full blur-xl pointer-events-none" />

          {/* Slogan */}
          <div className="flex justify-between items-center border-b border-white/10 pb-2 mb-3 text-3xs font-mono tracking-widest uppercase">
            <span>Beta Life Simulator</span>
            <span>试一下</span>
          </div>

          <div className="space-y-3.5">
            <span className="text-[10px] bg-white/15 text-white border border-white/10 px-2 py-0.5 rounded-sm inline-block">
              {copy.posterBadge}
            </span>
            
            <h3 className="text-base font-black tracking-tight leading-tight">
              《{displayName.length > 15 ? displayName.slice(0, 15) : displayName}》
            </h3>

            {/* Poster grid stats */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className={`p-2.5 rounded-xl border flex flex-col justify-center ${st.badge}`}>
                <span className="text-3xs font-semibold opacity-60 block">{copy.probabilityLabel.replace("30天", "")}</span>
                <span className={`text-sm font-black ${st.highlight}`}>{report.successProbability}%</span>
              </div>
              <div className={`p-2.5 rounded-xl border flex flex-col justify-center ${st.badge}`}>
                <span className="text-3xs font-semibold opacity-60 block">{copy.riskLabel}</span>
                <span className="text-xs font-black">
                  {report.riskLevel === "low" ? "低风险" : report.riskLevel === "medium" ? "中等风险" : report.riskLevel === "high" ? "高风险" : "极高风险"}
                </span>
              </div>
            </div>

            {/* expected profit info */}
            <div className={`p-3 rounded-xl border flex justify-between items-center ${st.badge}`}>
              <span className="text-3xs font-semibold opacity-60">{copy.expectedLabel}</span>
              <span className={`text-xs font-black ${st.highlight}`}>{report.expectedRevenue}</span>
            </div>

            {recommendedRoute && (
              <div className={`p-3 rounded-xl border space-y-1 ${st.badge}`}>
                <span className="text-3xs font-semibold opacity-60">推荐路线</span>
                <p className={`text-xs font-black ${st.highlight}`}>{recommendedRoute.title}</p>
                <p className="text-3xs opacity-75">后悔风险 {recommendedRoute.regretRisk}%</p>
              </div>
            )}

            <div className={`p-3 rounded-xl border space-y-1 ${st.badge}`}>
              <span className="text-3xs font-semibold opacity-60">Agent 反对意见</span>
              <p className="text-[10px] leading-relaxed opacity-90">
                {agentObjection.length > 46 ? `${agentObjection.slice(0, 46)}...` : agentObjection}
              </p>
            </div>

            {/* Summary bubble */}
            <div className="space-y-1 pt-1.5">
              <span className="block text-3xs font-bold uppercase tracking-wider opacity-60">AI 深度洞察：</span>
              <p className="text-[11px] leading-relaxed opacity-90 italic">
                “ {report.finalRecommendation.length > 70 ? report.finalRecommendation.slice(0, 70) + "..." : report.finalRecommendation} ”
              </p>
            </div>

            {/* Bottom barcode decoration representing ticketing / validation */}
            <div className="flex items-center justify-between border-t border-white/10 pt-3.5 mt-2">
              <div className="space-y-0.5">
                <span className="block text-3xs font-black tracking-wide uppercase opacity-75">试一下</span>
                <span className="block text-[8px] opacity-40">{copy.footerLine}</span>
              </div>
              
              {/* Fake Ticket barcode block */}
              <div className="flex flex-col items-end opacity-50 select-none">
                <div className="flex gap-[1px] h-5 items-stretch">
                  {[2, 1, 3, 1, 2, 4, 1, 3, 2, 1, 2, 3, 1, 2, 4, 1].map((w, idx) => (
                    <div key={idx} className="bg-white" style={{ width: `${w}px` }} />
                  ))}
                </div>
                <span className="text-[7px] font-mono mt-0.5 tracking-widest uppercase">ID:{simulation.id.slice(0, 8)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* WeChat-oriented image share action & status */}
        <div className="flex gap-2.5 pt-1">
          <button
            id="btn-share-wechat"
            onClick={handleShareToWechat}
            disabled={isShareButtonDisabled}
            className={`flex-1 inline-flex items-center justify-center gap-1.5 p-3 rounded-xl border text-xs font-bold cursor-pointer transition-colors ${
              shareStatus !== "idle" && shareStatus !== "preparing"
                ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                : isShareButtonDisabled
                  ? "bg-amber-50 border-amber-200 text-amber-700 cursor-wait"
                  : "bg-gray-100 hover:bg-gray-200 border-gray-200 text-gray-700"
            }`}
          >
            {shareStatus === "preparing" ? (
              <>
                <LoaderCircle className="w-4 h-4 animate-spin" />
                <span>{getShareStatusLabel(shareStatus, preferNativeShare)}</span>
              </>
            ) : shareStatus === "idle" ? (
              <>
                <Share2 className="w-4 h-4" />
                <span>{getShareStatusLabel(shareStatus, preferNativeShare)}</span>
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4 text-emerald-500" />
                <span>{getShareStatusLabel(shareStatus, preferNativeShare)}</span>
              </>
            )}
          </button>
        </div>

        {shareStatus === "text-unavailable" && (
          <textarea
            aria-label="分享文字口令"
            readOnly
            value={shareText}
            onFocus={(event) => event.currentTarget.select()}
            className="w-full min-h-28 rounded-xl border border-gray-200 bg-gray-50 p-3 text-left text-[11px] leading-relaxed text-gray-700"
          />
        )}
      </motion.div>
    </div>
  );
}
