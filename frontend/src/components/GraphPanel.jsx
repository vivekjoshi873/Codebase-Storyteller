import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { useStore } from "../store";

const NODE_FILL = "#151929";
const NODE_STROKE = "#818CF8";
const SELECTED_FILL = "#6EE7B7";
const HIGHLIGHT_COLOR = "#F59E0B";
const LABEL_COLOR = "#94A3B8";
const LINK_COLOR = "#818CF8";
const LINK_OPACITY = 0.25;
const LARGE_GRAPH_LABEL_LIMIT = 300;

export default function GraphPanel() {
  const svgRef = useRef(null);
  const graphData = useStore((s) => s.graphData);
  const activeNodes = useStore((s) => s.activeNodes);
  const selectedFile = useStore((s) => s.selectedFile);
  const setSelectedFile = useStore((s) => s.setSelectedFile);
  const entranceDoneRef = useRef(false);
  const [tooltip, setTooltip] = useState({
    x: 0,
    y: 0,
    visible: false,
    label: "",
    path: "",
  });

  const totalNodes = graphData?.nodes?.length || 0;
  const totalEdges = graphData?.edges?.length || 0;

  useEffect(() => {
    if (!svgRef.current || !graphData.nodes.length) return;

    entranceDoneRef.current = false;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const width = svgRef.current.clientWidth || 640;
    const height = svgRef.current.clientHeight || 480;

    const defs = svg.append("defs");

    const grad = defs
      .append("radialGradient")
      .attr("id", "bgGrad")
      .attr("cx", "50%")
      .attr("cy", "50%")
      .attr("r", "50%");
    grad
      .append("stop")
      .attr("offset", "0%")
      .attr("stop-color", "#6EE7B7")
      .attr("stop-opacity", 0.04);
    grad
      .append("stop")
      .attr("offset", "100%")
      .attr("stop-color", "#080B14")
      .attr("stop-opacity", 0);

    svg
      .append("rect")
      .attr("width", "100%")
      .attr("height", "100%")
      .attr("fill", "url(#bgGrad)");

    const filter = defs.append("filter").attr("id", "glow");
    filter
      .append("feGaussianBlur")
      .attr("stdDeviation", "3")
      .attr("result", "coloredBlur");
    const feMerge = filter.append("feMerge");
    feMerge.append("feMergeNode").attr("in", "coloredBlur");
    feMerge.append("feMergeNode").attr("in", "SourceGraphic");

    const nodes = graphData.nodes.map((n) => ({ ...n }));
    const nodeIds = new Set(nodes.map((n) => n.id));
    const links = graphData.edges
      .filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to))
      .map((e) => ({ source: e.from, target: e.to }));

    const showLabels = nodes.length <= LARGE_GRAPH_LABEL_LIMIT;
    const radius = nodes.length > 1000 ? 3.5 : 5;

    const simulation = d3
      .forceSimulation(nodes)
      .force(
        "link",
        d3
          .forceLink(links)
          .id((d) => d.id)
          .distance(nodes.length > 1000 ? 42 : 80)
          .strength(0.3),
      )
      .force(
        "charge",
        d3.forceManyBody().strength(nodes.length > 1000 ? -18 : -180),
      )
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius(radius + 8));

    const linkGroup = svg.append("g").attr("class", "links");
    const link = linkGroup
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke", LINK_COLOR)
      .attr("stroke-opacity", LINK_OPACITY)
      .attr("stroke-width", 1);

    const nodeGroup = svg.append("g").attr("class", "nodes");
    const node = nodeGroup
      .selectAll("circle")
      .data(nodes)
      .join("circle")
      .attr("r", radius)
      .attr("fill", NODE_FILL)
      .attr("stroke", NODE_STROKE)
      .attr("stroke-width", 1.5)
      .attr("data-node-id", (d) => d.id)
      .style("cursor", "pointer");

    const labelGroup = svg.append("g").attr("class", "labels");
    let label;
    if (showLabels) {
      label = labelGroup
        .selectAll("text")
        .data(nodes)
        .join("text")
        .text((d) => d.label)
        .attr("font-size", 9)
        .attr("font-family", "JetBrains Mono, monospace")
        .attr("fill", LABEL_COLOR)
        .attr("text-anchor", "middle")
        .attr("dy", -(radius + 5))
        .style("pointer-events", "none")
        .style("user-select", "none");
    }

    node
      .on("mouseover", function (event, d) {
        d3.select(this)
          .transition()
          .duration(150)
          .attr("r", 8)
          .attr("fill", "#818CF8");
        const [mx, my] = d3.pointer(event, svgRef.current);
        setTooltip({
          visible: true,
          x: mx,
          y: my,
          label: d.label || d.id.split("/").pop(),
          path: d.id,
        });
      })
      .on("mousemove", function (event) {
        const [mx, my] = d3.pointer(event, svgRef.current);
        setTooltip((prev) => ({ ...prev, x: mx, y: my }));
      })
      .on("mouseout", function (event, d) {
        const isSelected = selectedFile === d.id;
        const isActive = activeNodes.includes(d.id);
        d3.select(this)
          .transition()
          .duration(150)
          .attr("r", isSelected ? 7 : isActive ? 8 : radius)
          .attr(
            "fill",
            isSelected
              ? SELECTED_FILL
              : isActive
                ? HIGHLIGHT_COLOR
                : NODE_FILL,
          );
        setTooltip((prev) => ({ ...prev, visible: false }));
      });

    let didDrag = false;

    node.call(
      d3
        .drag()
        .on("start", (event, d) => {
          didDrag = false;
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on("drag", (event, d) => {
          didDrag = true;
          d.fx = event.x;
          d.fy = event.y;
        })
        .on("end", (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
          if (!didDrag) {
            setSelectedFile(d.id);
          }
        }),
    );

    node
      .style("opacity", 0)
      .attr("r", 0)
      .transition()
      .delay((d, i) => i * 4)
      .duration(400)
      .style("opacity", 1)
      .attr("r", radius)
      .on("end", function () {
        entranceDoneRef.current = true;
      });

    simulation.on("tick", () => {
      link
        .attr("x1", (d) => d.source.x)
        .attr("y1", (d) => d.source.y)
        .attr("x2", (d) => d.target.x)
        .attr("y2", (d) => d.target.y);

      node.attr("cx", (d) => d.x).attr("cy", (d) => d.y);

      if (label) {
        label.attr("x", (d) => d.x).attr("y", (d) => d.y);
      }
    });

    const zoom = d3
      .zoom()
      .scaleExtent([0.3, 4])
      .on("zoom", (event) => {
        linkGroup.attr("transform", event.transform);
        nodeGroup.attr("transform", event.transform);
        labelGroup.attr("transform", event.transform);
      });
    svg.call(zoom);

    return () => simulation.stop();
  }, [graphData]);

  useEffect(() => {
    if (!svgRef.current || !entranceDoneRef.current) return;
    const svg = d3.select(svgRef.current);

    svg
      .selectAll("circle[data-node-id]")
      .transition()
      .duration(300)
      .attr("fill", (d) => {
        if (selectedFile === d.id) return SELECTED_FILL;
        if (activeNodes.includes(d.id)) return HIGHLIGHT_COLOR;
        return NODE_FILL;
      })
      .attr("stroke", (d) => {
        if (selectedFile === d.id) return SELECTED_FILL;
        if (activeNodes.includes(d.id)) return HIGHLIGHT_COLOR;
        return NODE_STROKE;
      })
      .attr("r", (d) => {
        if (selectedFile === d.id) return 7;
        if (activeNodes.includes(d.id)) return 8;
        return 5;
      })
      .attr("filter", (d) =>
        activeNodes.includes(d.id) ? "url(#glow)" : null,
      );
  }, [activeNodes, selectedFile]);

  return (
    <div className="relative w-full h-full bg-base overflow-hidden">
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 h-9 bg-surface border-b border-border-subtle z-10">
        <span className="text-[10px] tracking-widest text-text-muted uppercase">
          DEPENDENCY GRAPH
        </span>
        <span className="text-[10px] tracking-widest text-text-muted">
          {totalNodes} files / {totalEdges} imports
        </span>
      </div>

      {!totalNodes && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
          <div>
            <p className="text-sm font-medium text-text-secondary">
              No graph loaded
            </p>
            <p className="mt-1 text-xs text-text-muted">
              Analyse a GitHub repository to see files and dependencies.
            </p>
          </div>
        </div>
      )}

      <svg ref={svgRef} width="100%" height="100%" />

      <div
        className="absolute pointer-events-none px-3 py-2 bg-overlay border border-border-default rounded-lg text-xs font-mono text-text-primary shadow-card transition-opacity duration-150"
        style={{
          left: tooltip.x + 12,
          top: tooltip.y - 8,
          opacity: tooltip.visible ? 1 : 0,
        }}
      >
        <div>{tooltip.label}</div>
        <div className="text-text-muted">{tooltip.path}</div>
      </div>

      {!!totalNodes && (
        <div className="absolute bottom-4 left-4 px-3 py-1 rounded-lg bg-elevated border border-border-subtle font-mono text-xs text-text-secondary">
          {totalNodes} files · {totalEdges} imports
        </div>
      )}
    </div>
  );
}
