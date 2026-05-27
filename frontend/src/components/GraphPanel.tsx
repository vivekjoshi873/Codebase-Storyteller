import { useEffect, useRef, useState, type JSX } from "react";
import * as d3 from "d3";
import type {
  D3DragEvent,
  D3ZoomEvent,
  DragBehavior,
  Selection,
  SimulationLinkDatum,
  SimulationNodeDatum,
  ZoomBehavior,
} from "d3";
import { useStore } from "../store";
import { useTheme } from "@/hooks/useTheme";
import type { D3Link, GraphNode } from "@/types";

const SELECTED_FILL = "#7C7CFA";
const ACTIVE_FILL = "#E8A838";
const LABEL_SELECTED_COLOR = "#7C7CFA";
const LABEL_ACTIVE_COLOR = "#E8A838";
const LINK_SELECTED_COLOR = "rgba(124,124,250,0.25)";
const LARGE_GRAPH_LABEL_LIMIT = 300;
const ACTIVE_CLASS_TIMEOUT_MS = 4000;

type SimNode = GraphNode & SimulationNodeDatum;
type SimLink = SimulationLinkDatum<SimNode>;
type TooltipViewState = {
  visible: boolean;
  x: number;
  y: number;
  label: string;
  path: string;
  imports: number;
};

const getLinkNodeId = (node: string | number | SimNode): string => {
  if (typeof node === "object") return node.id;
  return String(node);
};

const readGraphTheme = (): {
  graphBg: string;
  nodeFill: string;
  nodeStroke: string;
  nodeHover: string;
  edgeColor: string;
  labelColor: string;
  labelHover: string;
  gradC1: string;
  gradC2: string;
} => {
  const style = getComputedStyle(document.documentElement);
  return {
    graphBg: style.getPropertyValue("--graph-bg").trim(),
    nodeFill: style.getPropertyValue("--graph-node-fill").trim(),
    nodeStroke: style.getPropertyValue("--graph-node-stroke").trim(),
    nodeHover: style.getPropertyValue("--graph-node-hover").trim(),
    edgeColor: style.getPropertyValue("--graph-edge").trim(),
    labelColor: style.getPropertyValue("--graph-label").trim(),
    labelHover: style.getPropertyValue("--graph-label-hover").trim(),
    gradC1: style.getPropertyValue("--graph-gradient-c1").trim(),
    gradC2: style.getPropertyValue("--graph-gradient-c2").trim(),
  };
};

const GraphPanel = (): JSX.Element => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const graphData = useStore((s) => s.graphData);
  const activeNodes = useStore((s) => s.activeNodes);
  const selectedFile = useStore((s) => s.selectedFile);
  const setSelectedFile = useStore((s) => s.setSelectedFile);
  const { theme } = useTheme();
  const entranceDoneRef = useRef<boolean>(false);
  const selectedFileRef = useRef<string | null>(selectedFile);
  const activeNodesRef = useRef<string[]>(activeNodes);
  const [tooltip, setTooltip] = useState<TooltipViewState>({
    x: 0,
    y: 0,
    visible: false,
    label: "",
    path: "",
    imports: 0,
  });

  const totalNodes = graphData.nodes.length;
  const totalEdges = graphData.edges.length;

  useEffect((): void => {
    selectedFileRef.current = selectedFile;
  }, [selectedFile]);

  useEffect((): void => {
    activeNodesRef.current = activeNodes;
  }, [activeNodes]);

  useEffect((): (() => void) | void => {
    if (!svgRef.current || !graphData.nodes.length) return;

    entranceDoneRef.current = false;
    const svg: Selection<SVGSVGElement, unknown, null, undefined> = d3.select(svgRef.current);
    svg.interrupt().transition().duration(150).style("opacity", 0);
    svg.selectAll("*").remove();

    const { graphBg, nodeFill, nodeStroke, nodeHover, edgeColor, labelColor, labelHover, gradC1, gradC2 } = readGraphTheme();
    const width = svgRef.current.clientWidth || 800;
    const height = svgRef.current.clientHeight || 600;

    const defs = svg.append("defs");
    const radialGradient = defs.append("radialGradient").attr("id", "graphBg").attr("cx", "50%").attr("cy", "50%").attr("r", "45%");
    radialGradient.append("stop").attr("offset", "0%").attr("stop-color", gradC1);
    radialGradient.append("stop").attr("offset", "100%").attr("stop-color", gradC2);

    const glow = defs.append("filter").attr("id", "nodeGlow").attr("x", "-50%").attr("y", "-50%").attr("width", "200%").attr("height", "200%");
    glow.append("feGaussianBlur").attr("stdDeviation", "4").attr("result", "blur");
    const glowMerge = glow.append("feMerge");
    glowMerge.append("feMergeNode").attr("in", "blur");
    glowMerge.append("feMergeNode").attr("in", "SourceGraphic");

    const pulseGlow = defs.append("filter").attr("id", "nodePulseGlow").attr("x", "-80%").attr("y", "-80%").attr("width", "360%").attr("height", "360%");
    pulseGlow.append("feGaussianBlur").attr("stdDeviation", "6").attr("result", "blur");
    const pulseMerge = pulseGlow.append("feMerge");
    pulseMerge.append("feMergeNode").attr("in", "blur");
    pulseMerge.append("feMergeNode").attr("in", "SourceGraphic");

    svg.append("rect").attr("width", "100%").attr("height", "100%").attr("fill", graphBg);
    svg.append("rect").attr("width", "100%").attr("height", "100%").attr("fill", "url(#graphBg)");

    const nodes: SimNode[] = graphData.nodes.map((node) => ({ ...node }));
    const nodeIds = new Set(nodes.map((node) => node.id));
    const links: SimLink[] = graphData.edges
      .filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to))
      .map((edge): D3Link => ({ source: edge.from, target: edge.to }));

    const importCounts = new Map<string, number>();
    graphData.edges.forEach((edge) => {
      importCounts.set(edge.from, (importCounts.get(edge.from) ?? 0) + 1);
    });

    const showLabels = nodes.length <= LARGE_GRAPH_LABEL_LIMIT;
    const radius = nodes.length > 1000 ? 3.5 : 5;

    const linkGroup = svg.append("g").attr("class", "links");
    const nodeGroup = svg.append("g").attr("class", "nodes");
    const labelGroup = svg.append("g").attr("class", "labels");

    const simulation = d3
      .forceSimulation<SimNode>(nodes)
      .force(
        "link",
        d3
          .forceLink<SimNode, SimLink>(links)
          .id((node: SimNode) => node.id)
          .distance(nodes.length > 1000 ? 42 : 80)
          .strength(0.3),
      )
      .force("charge", d3.forceManyBody<SimNode>().strength(nodes.length > 1000 ? -18 : -180))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide<SimNode>().radius(radius + 8));

    const link: Selection<SVGLineElement, SimLink, SVGGElement, unknown> = linkGroup
      .selectAll<SVGLineElement, SimLink>("line")
      .data(links)
      .join("line")
      .attr("stroke", edgeColor)
      .attr("stroke-opacity", 1)
      .attr("stroke-width", 1)
      .attr("data-source-id", (item: SimLink) => getLinkNodeId(item.source as string | number | SimNode))
      .attr("data-target-id", (item: SimLink) => getLinkNodeId(item.target as string | number | SimNode));

    const node: Selection<SVGCircleElement, SimNode, SVGGElement, unknown> = nodeGroup
      .selectAll<SVGCircleElement, SimNode>("circle")
      .data(nodes)
      .join("circle")
      .attr("r", radius)
      .attr("fill", nodeFill)
      .attr("stroke", nodeStroke)
      .attr("stroke-width", 1.5)
      .attr("data-node-id", (item: SimNode) => item.id)
      .style("cursor", "pointer");

    let label: Selection<SVGTextElement, SimNode, SVGGElement, unknown> | null = null;
    if (showLabels) {
      label = labelGroup
        .selectAll<SVGTextElement, SimNode>("text")
        .data(nodes)
        .join("text")
        .text((item: SimNode) => item.label)
        .attr("font-size", 9)
        .attr("font-family", "JetBrains Mono, monospace")
        .attr("fill", labelColor)
        .attr("text-anchor", "middle")
        .attr("dy", -10)
        .attr("data-label-id", (item: SimNode) => item.id)
        .style("pointer-events", "none")
        .style("user-select", "none");
    }

    const updateConnectedLinks = (nodeId: string, highlighted: boolean): void => {
      link
        .transition()
        .duration(120)
        .attr("stroke", (item: SimLink) => {
          const sourceId = getLinkNodeId(item.source as string | number | SimNode);
          const targetId = getLinkNodeId(item.target as string | number | SimNode);
          if (selectedFileRef.current && (sourceId === selectedFileRef.current || targetId === selectedFileRef.current)) return LINK_SELECTED_COLOR;
          if (highlighted && (sourceId === nodeId || targetId === nodeId)) return labelHover;
          return edgeColor;
        })
        .attr("stroke-width", (item: SimLink) => {
          const sourceId = getLinkNodeId(item.source as string | number | SimNode);
          const targetId = getLinkNodeId(item.target as string | number | SimNode);
          return selectedFileRef.current && (sourceId === selectedFileRef.current || targetId === selectedFileRef.current) ? 1.5 : 1;
        });
    };

    node
      .on("mouseover", function (event: MouseEvent, item: SimNode): void {
        d3.select<SVGCircleElement, SimNode>(this)
          .transition()
          .duration(120)
          .attr("r", 7)
          .attr("fill", nodeHover)
          .attr("stroke", labelHover);

        updateConnectedLinks(item.id, true);

        const [mx, my] = d3.pointer(event, svgRef.current);
        setTooltip({
          visible: true,
          x: mx,
          y: my,
          label: item.label || item.id.split("/").pop() || item.id,
          path: item.id,
          imports: importCounts.get(item.id) ?? 0,
        });
      })
      .on("mousemove", function (event: MouseEvent): void {
        const [mx, my] = d3.pointer(event, svgRef.current);
        setTooltip((prev) => ({ ...prev, x: mx, y: my }));
      })
      .on("mouseout", function (_event: MouseEvent, item: SimNode): void {
        const isSelected = selectedFileRef.current === item.id;
        const isActive = activeNodesRef.current.includes(item.id);

        d3.select<SVGCircleElement, SimNode>(this)
          .transition()
          .duration(120)
          .attr("r", isSelected ? 7 : isActive ? 8 : radius)
          .attr("fill", isActive ? ACTIVE_FILL : isSelected ? SELECTED_FILL : nodeFill)
          .attr("stroke", isActive ? ACTIVE_FILL : isSelected ? SELECTED_FILL : nodeStroke)
          .attr("filter", isActive ? "url(#nodePulseGlow)" : isSelected ? "url(#nodeGlow)" : null);

        d3.select(svgRef.current)
          .selectAll<SVGTextElement, SimNode>(`text[data-label-id="${CSS.escape(item.id)}"]`)
          .attr("fill", isActive ? LABEL_ACTIVE_COLOR : isSelected ? LABEL_SELECTED_COLOR : labelColor);

        updateConnectedLinks(item.id, false);
        setTooltip((prev) => ({ ...prev, visible: false }));
      });

    let didDrag = false;
    const drag: DragBehavior<SVGCircleElement, SimNode, SimNode | d3.SubjectPosition> = d3
      .drag<SVGCircleElement, SimNode>()
      .on("start", (event: D3DragEvent<SVGCircleElement, SimNode, SimNode>, item: SimNode): void => {
        didDrag = false;
        if (!event.active) simulation.alphaTarget(0.3).restart();
        item.fx = item.x ?? 0;
        item.fy = item.y ?? 0;
      })
      .on("drag", (event: D3DragEvent<SVGCircleElement, SimNode, SimNode>, item: SimNode): void => {
        didDrag = true;
        item.fx = event.x;
        item.fy = event.y;
      })
      .on("end", (event: D3DragEvent<SVGCircleElement, SimNode, SimNode>, item: SimNode): void => {
        if (!event.active) simulation.alphaTarget(0);
        item.fx = null;
        item.fy = null;
        if (!didDrag) setSelectedFile(item.id);
      });
    node.call(drag);

    node
      .style("opacity", 0)
      .attr("r", 0)
      .transition()
      .delay((_item: SimNode, index: number): number => index * 4)
      .duration(400)
      .style("opacity", 1)
      .attr("r", radius)
      .on("end", function (): void {
        entranceDoneRef.current = true;
      });

    simulation.on("tick", (): void => {
      link
        .attr("x1", (item: SimLink) => ((item.source as SimNode).x ?? 0))
        .attr("y1", (item: SimLink) => ((item.source as SimNode).y ?? 0))
        .attr("x2", (item: SimLink) => ((item.target as SimNode).x ?? 0))
        .attr("y2", (item: SimLink) => ((item.target as SimNode).y ?? 0));

      node.attr("cx", (item: SimNode) => item.x ?? 0).attr("cy", (item: SimNode) => item.y ?? 0);
      if (label) {
        label.attr("x", (item: SimNode) => item.x ?? 0).attr("y", (item: SimNode) => item.y ?? 0);
      }
    });

    const zoom: ZoomBehavior<SVGSVGElement, unknown> = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 4])
      .on("zoom", (event: D3ZoomEvent<SVGSVGElement, unknown>): void => {
        linkGroup.attr("transform", event.transform.toString());
        nodeGroup.attr("transform", event.transform.toString());
        labelGroup.attr("transform", event.transform.toString());
      });
    svg.call(zoom);
    svg.transition().duration(150).style("opacity", 1);

    return (): void => {
      simulation.stop();
    };
  }, [graphData, setSelectedFile, theme]);

  useEffect((): (() => void) | void => {
    if (!svgRef.current || !entranceDoneRef.current) return;
    const svg = d3.select(svgRef.current);
    const { nodeFill, nodeStroke, edgeColor, labelColor } = readGraphTheme();

    svg
      .selectAll<SVGCircleElement, SimNode>("circle[data-node-id]")
      .classed("node-pulse-active", (item: SimNode) => activeNodes.includes(item.id))
      .transition()
      .duration(120)
      .attr("fill", (item: SimNode) => (activeNodes.includes(item.id) ? ACTIVE_FILL : selectedFile === item.id ? SELECTED_FILL : nodeFill))
      .attr("stroke", (item: SimNode) => (activeNodes.includes(item.id) ? ACTIVE_FILL : selectedFile === item.id ? SELECTED_FILL : nodeStroke))
      .attr("r", (item: SimNode) => {
        if (activeNodes.includes(item.id)) return 8;
        if (selectedFile === item.id) return 7;
        return 5;
      })
      .attr("filter", (item: SimNode) => (activeNodes.includes(item.id) ? "url(#nodePulseGlow)" : selectedFile === item.id ? "url(#nodeGlow)" : null));

    svg
      .selectAll<SVGTextElement, SimNode>("text[data-label-id]")
      .transition()
      .duration(120)
      .attr("fill", (item: SimNode) => (activeNodes.includes(item.id) ? LABEL_ACTIVE_COLOR : selectedFile === item.id ? LABEL_SELECTED_COLOR : labelColor));

    svg
      .selectAll<SVGLineElement, SimLink>("line")
      .transition()
      .duration(120)
      .attr("stroke", (item: SimLink) => {
        const sourceId = getLinkNodeId(item.source as string | number | SimNode);
        const targetId = getLinkNodeId(item.target as string | number | SimNode);
        return selectedFile && (sourceId === selectedFile || targetId === selectedFile) ? LINK_SELECTED_COLOR : edgeColor;
      })
      .attr("stroke-width", (item: SimLink) => {
        const sourceId = getLinkNodeId(item.source as string | number | SimNode);
        const targetId = getLinkNodeId(item.target as string | number | SimNode);
        return selectedFile && (sourceId === selectedFile || targetId === selectedFile) ? 1.5 : 1;
      });

    if (activeNodes.length === 0) return;
    const timeout = window.setTimeout((): void => {
      const currentSvg = d3.select(svgRef.current);
      currentSvg.selectAll<SVGCircleElement, SimNode>("circle[data-node-id]").classed("node-pulse-active", false);
    }, ACTIVE_CLASS_TIMEOUT_MS);

    return (): void => window.clearTimeout(timeout);
  }, [activeNodes, selectedFile, theme]);

  return (
    <div className="theme-aware relative w-full h-full bg-[#F2EFE8] dark:bg-[#0A0A0F] overflow-hidden">
      <div className="theme-aware flex items-center justify-between h-10 px-5 bg-[#F2EFE8] dark:bg-[#0A0A0F] border-b border-black/[0.06] dark:border-white/[0.06] absolute top-0 left-0 right-0 z-10">
        <span className="eyebrow text-[#8A8A9A] dark:text-[#5A5A68]">DEPENDENCY GRAPH</span>
        <span className="mono-data text-[#8A8A9A] dark:text-[#5A5A68] text-[11px]">{totalNodes} FILES - {totalEdges} IMPORTS</span>
      </div>

      <svg ref={svgRef} width="100%" height="100%" />

      <div
        className="absolute pointer-events-none z-30 shadow-float rounded-lg border border-black/[0.08] dark:border-white/[0.08] bg-[#D8D4C8] dark:bg-[#26263A] px-3 py-2 min-w-[160px] transition-all duration-200 ease-out"
        style={{ left: tooltip.x + 14, top: tooltip.y - 8, opacity: tooltip.visible ? 1 : 0 }}
      >
        <div className="text-sm font-medium text-[#0F0F12] dark:text-[#F2F2F4] font-mono">{tooltip.label}</div>
        <div className="text-[11px] text-[#8A8A9A] dark:text-[#5A5A68] mono-data mt-0.5 truncate max-w-[200px]">{tooltip.path}</div>
        <div className="my-2 border-t border-black/[0.08] dark:border-white/[0.08]" />
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-[#8A8A9A] dark:text-[#5A5A68]">Imports</span>
          <span className="text-[10px] mono-data text-[#4A4A58] dark:text-[#9B9BA8]">{tooltip.imports} imports</span>
        </div>
      </div>

      {!!totalNodes && (
        <div className="absolute bottom-5 left-5 z-10">
          <div className="font-mono text-[52px] font-bold text-[#0F0F12] dark:text-[#F2F2F4] leading-none tracking-[-0.04em]">{totalNodes}</div>
          <div className="eyebrow text-[#8A8A9A] dark:text-[#5A5A68] mt-1">FILES ANALYSED</div>
        </div>
      )}
    </div>
  );
};

export default GraphPanel;
